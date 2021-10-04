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
		yargs.option('port',     {describe:'Port for MQTT', type:'number', default:parseInt(process.env.MQTT_PORT) || 1883});
		yargs.option('interval', {describe:'Poll interval in minutes', type:'number', default:parseInt(process.env.INTERVAL) || 15});
		yargs.option('topic',    {describe:'MQTT root topic', default:process.env.MQTT_TOPIC || 'RSS'});
		yargs.option('debug',    {describe:'Debug mode', type:'boolean', default:parseInt(process.env.DEBUG) || false});

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
		this.timer   = new Timer();

	}


    async fetchURL(url) {

		this.debug(`Fetching ${url}...`);

		let result = await this.parser.parseURL(url);

		result.items.sort((A, B) => {
			let timeA = new Date(A.isoDate);
			let timeB = new Date(B.isoDate);

			return timeB.getTime() - timeA.getTime();

		});

		let lastItem = result.items[0];
		let title = lastItem.title;
		let link = lastItem.link;
		let content = lastItem.contentSnippet;
		let date = lastItem.isoDate;

		this.debug(lastItem);

		return {title:title, content:content, link:link, date:date};
    }

	async fetch() {

		try {
			this.debug(`Fetching RSS feeds...`);

			for (const [name, entry] of Object.entries(this.entries)) {

				try {
					let feed = await this.fetchURL(entry.url);
	
					if (entry.feed == undefined || JSON.stringify(entry.feed) != JSON.stringify(feed)) {
		
						this.debug(`Feed ${name} changed.`);
						this.publish(`${this.argv.topic}/${name}/json`, feed);
						//this.publish(`${this.argv.topic}/${name}/timestamp`, feed.date);
		
						Object.keys(feed).forEach((key) => {
							this.publish(`${this.argv.topic}/${name}/${key}`, feed[key]);
						});
		
						entry.feed = feed;
					}
	
				}
				catch(error) {
					this.log(error);
				}
	
			}
	
		}
		catch(error) {
			this.log(error);

		}

	}



	publish(topic, value) {
		value = JSON.stringify(value);
		this.debug(`Publishing ${topic}:${value}`);
		this.mqtt.publish(topic, value, {retain:true});
	}


	async loop() {
		try {
			await this.fetch();
		}
		catch (error) {
			this.log(error);
		}
		finally {
			setTimeout(this.loop.bind(this), 1000 * 60 * this.argv.interval);
		}
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
							this.entries[args.name] = {url:config.url};

							this.timer.setTimer(2000, async () => {
								await this.fetch();
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
