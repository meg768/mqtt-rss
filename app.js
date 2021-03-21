#!/usr/bin/env node

var MQTT = require('mqtt-ex');
var Parser = require('rss-parser');
var Events = require('events');

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

		this.argv   = yargs.argv;
		this.log    = console.log;
		this.debug  = this.argv.debug ? this.log : () => {};
		this.config = {};
		this.parser = new Parser();
		this.feeds  = {};

	}


    async fetch(feed) {

		this.debug(`Fetching ${feed.url}...`);

		var result = await this.parser.parseURL(feed.url);
		var lastItem = {};

		result.items.forEach((item) => {
			let timestamp = new Date(item.isoDate);

			if (lastItem.timestamp == undefined || (lastItem.timestamp.getTime() < timestamp.getTime())) {
				lastItem = {key:`${item.isoDate}:${item.title}`, timestamp:timestamp, item:item};
			}
		});

		if (feed.cache.key == undefined || feed.cache.key != lastItem.key) {
			this.debug(lastItem);
			return feed.cache = lastItem;
		}
    }

	publish(topic, value) {
		value = JSON.stringify(value);
		this.debug(`Publishing ${topic}:${value}`);
		this.mqtt.publish(topic, value, {retain:true});
	}

	async update() {
		for (const [name, feed] of Object.entries(this.feeds)) {
			let result = await this.fetch(feed);

			if (result) {
				let title = result.item.title;
				let link = result.item.link;
				let content = result.item.contentSnippet;
				let date = result.item.isoDate;

				if (content == undefined)
					content = result.item['content:encodedSnippet'];

				this.publish(`${this.argv.topic}/${name}/title`, title);
				this.publish(`${this.argv.topic}/${name}/link`, link);
				this.publish(`${this.argv.topic}/${name}/content`, content);
				this.publish(`${this.argv.topic}/${name}/date`, date);
	
			}
		  }
		  

	}

	async loop() {
		this.log(`Updating RSS feeds...`);
		await this.update();
		setTimeout(this.loop.bind(this), 1000 * 60 * 5);
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
						delete this.feeds[args.name];
					}
					else {
						try {
							let config = JSON.parse(message);
							this.log(`Added RSS feed ${args.name}:${JSON.stringify(config)}...`);
							this.feeds[args.name] = {url:config.url, name:args.name, cache:{}};

							this.update();
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
