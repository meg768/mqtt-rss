#!/usr/bin/env node

var MQTT   = require('mqtt-ex');
var Parser = require('rss-parser');
var Events = require('events');
var Timer  = require('yow/timer');

require('dotenv').config();
require('yow/prefixConsole')();

class App {

	constructor() {
		var yargs = require('yargs');

		yargs.usage('Usage: $0 [options]')

		yargs.option('help',     {alias:'h', describe:'Displays this information'});
		yargs.option('host',     {describe:'Specifies MQTT host', default:process.env.MQTT_HOST});
		yargs.option('password', {describe:'Password for MQTT broker', default:process.env.MQTT_PASSWORD});
		yargs.option('username', {describe:'User name for MQTT broker', default:process.env.MQTT_USERNAME});
		yargs.option('port',     {describe:'Port for MQTT', default:process.env.MQTT_PORT});
		yargs.option('topic',    {describe:'MQTT root topic', default:process.env.MQTT_TOPIC});
		yargs.option('debug',    {describe:'Debug mode', type:'boolean', default:process.env.DEBUG === '1'});

		yargs.help();
		yargs.wrap(null);

		yargs.check(function(argv) {
			return true;
		});

		this.argv    = yargs.argv;
		this.log     = console.log;
		this.debug   = this.argv.debug ? this.log : () => {};
		this.parser  = new Parser();
		this.entries = {};
		this.cache   = {};
		this.timer   = new Timer();

	}


    async fetchURL(url) {

		this.debug(`Fetching ${url}...`);

		var result = await this.parser.parseURL(url);
		var lastItem = undefined;

		result.items.forEach((item) => {

			if (lastItem == undefined) {
				lastItem = item;
			}
			else {
				let itemTimestamp = new Date(item.isoDate);
				let lastTimeStamp = new Date(lastItem.isoDate);
	
				if (lastTimeStamp.getTime() < itemTimestamp.getTime()) {
					lastItem = item;
				}

			}
		});

		let title = lastItem.title;
		let link = lastItem.link;
		let content = lastItem.contentSnippet;
		let date = lastItem.isoDate;

		let feed = {title:title, content:content, link:link, date:date};

		this.debug(`Fetched ${url} - ${JSON.stringify(feed.title)}`);
		return feed;
    }


	async fetch() {
/*
		for (const [url, name] of Object.entries(this.entries)) {
			this.cache[url] = await this.fetchURL(url);

		}
		return;
*/
/*
		let promises = [];

		Object.keys(this.entries).forEach(async (name) => {
			let entry = this.entries[name];
			promises.push(this.fetchURL(entry.url));
		});

		await Promise.all(promises);
		return;
*/
		return new Promise((resolve, reject) => {
			let promise = Promise.resolve();

			Object.keys(this.entries).forEach((name) => {
				let entry = this.entries[name];
	
				promise = promise.then(() => {
					return this.fetchURL(entry.url);
				})
				.then((feed) => {
					this.cache[entry.url] = feed;
				});
			});
	
			promise.then(() => {
				resolve();
			})
	
		});

		
		Object.keys(this.entries).forEach(async (name) => {
			let entry = this.entries[name];
			this.cache[entry.url] = await this.fetchURL(entry.url);
		});
	}


	async update() {
		this.debug(`Updating...`);

		Object.keys(this.entries).forEach((name) => {
			let entry = this.entries[name];
			let cache = this.cache[entry.url];

			if (cache != undefined) {
				if (entry.cache == undefined || JSON.stringify(entry.cache) != JSON.stringify(cache)) {

					this.debug(`Feed ${entry.url} changed.`);
					this.debug(JSON.stringify(entry.url));
					this.debug(JSON.stringify(cache.url));

					Object.keys(cache).forEach((key) => {
						this.publish(`${this.argv.topic}/${name}/${key}`, cache[key]);
					});

					entry.cache = cache;
				}
				else {
					this.debug(`No change for url ${entry.url}.`);
				}
			}
			else {
				this.debug(`No cache for RSS feed ${entry.url}...`);
			}
		});		

		  		
	}

	publish(topic, value) {
		value = JSON.stringify(value);
		this.debug(`Publishing ${topic}:${value}`);
		this.mqtt.publish(topic, value, {retain:true});
	}


	async loop() {
		this.log(`Updating RSS feeds...`);
		await this.fetch();
		await this.update();
		setTimeout(this.loop.bind(this), 1000 * 60 * 15);
	}

	async run() {
		try {
			var argv = this.argv;

			this.mqtt = MQTT.connect(argv.host, {username:argv.username, password:argv.password, port:argv.port});
					
			this.mqtt.on('connect', () => {
				this.log(`Connected to host ${argv.host}:${argv.port}.`);

				
			});

			this.mqtt.subscribe(`${this.argv.topic}/#`);

			this.mqtt.on(`${this.argv.topic}/:name`, (topic, message, args) => {
				try {
					if (message == '') {
						this.log(`Removed topic ${topic}...`);
						delete this.entries[args.name];
					}
					else {
						try {
							let config = JSON.parse(message);
							this.log(`Added RSS feed ${args.name}:${JSON.stringify(config)}...`);
							this.entries[args.name] = {url:config.url, name:args.name};

							this.timer.setTimer(2000, async () => {
								await this.fetch();
								await this.update();
							});
						}
						catch(error) {
							throw new Error(`Invalid configuration "${message}".`);
						}
					}

	
				}
				catch(error) {
					this.log(error);
				}

			});

			this.loop();

		}
		catch(error) {
			console.error(error.stack);
		}

	}

}


new App().run();
