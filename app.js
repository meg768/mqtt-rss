#!/usr/bin/env node

var MQTT = require('mqtt-ex');
var Parser = require('rss-parser');
var Events = require('events');

require('dotenv').config();


class App {

	constructor() {
		var yargs = require('yargs');

		yargs.usage('Usage: $0 [options]')

		yargs.option('help',     {alias:'h', describe:'Displays this information'});
		yargs.option('host',     {describe:'Specifies MQTT host', default:process.env.MQTT_HOST});
		yargs.option('password', {describe:'Password for MQTT broker', default:process.env.MQTT_PASSWORD});
		yargs.option('username', {describe:'User name for MQTT broker', default:process.env.MQTT_USERNAME});
		yargs.option('port',     {describe:'Port for MQTT', default:process.env.MQTT_PORT});
		yargs.option('debug',    {describe:'Debug mode', type:'boolean', default:true});

		yargs.help();
		yargs.wrap(null);

		yargs.check(function(argv) {
			return true;
		});

		this.argv   = yargs.argv;
		this.debug  = this.argv.debug ? console.log : () => {};
		this.config = {};
		this.parser = new Parser();
		this.feeds = {};

		/*
        this.feeds = [
            {url:'https://www.sydsvenskan.se/rss.xml?latest',                        name: 'SDS',            description:'Sydsvenska Dagbladet'},
            {url:'https://digital.di.se/rss',                                        name: 'DI',             description:'Dagens Industri'},
            //{url:'http://api.sr.se/api/rss/program/83?format=145',                   name: 'SR',             description:'Sveriges Radio'},
            //{url:'http://feeds.bbci.co.uk/news/rss.xml',                             name: 'BBC',            description:'BBC'},
            {url:'http://www.svd.se/?service=rss',                                   name: 'SvD',            description:'Svenska Dagbladet'},
            {url:'https://feeds.expressen.se/nyheter',                               name: 'Expressen',      description:'Expressen'},
            //{url:'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',           name: 'New York Times', description:'New York Times'}
           // {url:'https://rss.aftonbladet.se/rss2/small/pages/sections/aftonbladet', name: 'Aftonbladet',    description:'Aftonbladet'}
        ];
		*/	
	}


    async fetch(feed) {

        return new Promise((resolve, reject) => {

            this.parser.parseURL(feed.url).then((result) => {
				this.debug(`Fetched ${feed.url}.`);

				var lastItem = {};

                result.items.forEach((item) => {
					let timestamp = new Date(item.isoDate);
					let title = item.title;
					let key = `${item.isoDate}:${title}`;

					if (lastItem.timestamp == undefined || (lastItem.timestamp.getTime() < timestamp.getTime())) {
						lastItem = {key:key, timestamp:timestamp, name:this.name, description:this.description, title:title};
					}
                });

				if (feed.cache.key == undefined || feed.cache.key != lastItem.key) {
					this.debug(lastItem);
					feed.cache = lastItem;
					resolve(lastItem);
				}
				else
					resolve();
            })
            .catch((error) => {
                reject(error);

            })
        });
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
				this.publish(`rss/${name}/title`, result.title);
				this.publish(`rss/${name}/timestamp`, result.timestamp);
	
			}
		  }
		  

	}

	async loop() {
		this.debug(`Updating...`);
		await this.update();
		setTimeout(this.loop.bind(this), 1000 * 60 * 5);
	}

	async run() {
		try {

			var argv = this.argv;

			this.mqtt = MQTT.connect(argv.host, {username:argv.username, password:argv.password, port:argv.port});
					
			this.mqtt.on('connect', () => {
				this.debug(`Connected to host ${argv.host}:${argv.port}.`);
			});

			this.mqtt.subscribe(`rss/#`);

			this.mqtt.on(`rss/:name/url`, (topic, message, args) => {
				try {
					if (message == '') {
						this.debug(`Removed topic ${topic}...`);
						delete this.feeds[args.name];
					}
					else {
						let url = '';

						try {
							url = JSON.parse(message);
						}
						catch(error) {
							throw new Error(`Invalid URL "${message}".`);
						}
		
						this.feeds[args.name] = {url:url, name:args.name, cache:{}};

						this.update();
	
					}

	
				}
				catch(error) {
					this.debug(error);
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
