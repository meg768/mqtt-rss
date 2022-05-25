#!/usr/bin/env node

var MQTT   = require('mqtt');
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
		yargs.option('config',   {describe:'Specifies JSON config file', default:'.config'});
		yargs.option('debug',    {describe:'Debug mode', type:'boolean', default:false});

		yargs.help();
		yargs.wrap(null);

		yargs.check(function(argv) {
			return true;
		});

		this.argv    = yargs.argv;
		this.config  = require('yow/config')(this.argv.config);
		this.log     = console.log;
		this.debug   = this.argv.debug || this.config.debug ? this.log : () => {};
		this.cache   = {};
	}


    async fetchURL(url) {

		this.debug(`Fetching ${url}...`);

		let parser = new Parser();
		let result = await parser.parseURL(url);

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


		return {date:date, title:title, content:content, link:link};
    }

	async fetch() {

		try {
			let headlines = [];

			for (const [name, url] of Object.entries(this.config.feeds)) {

				try {
					let rss = await this.fetchURL(url);
					let cache = this.cache[name];

					if (cache == undefined || cache.date < rss.date) {
						headlines.push({name:name, rss:rss});
						this.cache[name] = rss;
					}
				}
				catch(error) {
					this.log(error);
				}

			}

			// Sort the headlines according to date
			headlines.sort((a, b) => {
				return a.rss.date.valueOf() - b.rss.date.valueOf();
			});
			
			for (let headline of headlines) {
				this.publish(`${this.config.topic}/${headline.name}`, headline.rss);

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
			setTimeout(this.loop.bind(this), this.config.interval * 1000 * 60);
		}
	}

	async run() {
		try {
			var argv = this.argv;

			this.mqtt = MQTT.connect(this.config.host, {username:this.config.username, password:this.config.password, port:this.config.port});
					
			this.mqtt.on('connect', () => {
				this.debug(`Connected to host ${this.config.host}:${this.config.port}.`);
			});

			this.loop();

		}
		catch(error) {
			console.error(error.stack);
		}

	}

}


new App().run();
