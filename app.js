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
		yargs.option('topic',    {describe:'MQTT root topic', default:process.env.MQTT_TOPIC});
		yargs.option('debug',    {describe:'Debug mode', type:'boolean', default:false});

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

					if (lastItem.timestamp == undefined || (lastItem.timestamp.getTime() < timestamp.getTime())) {
						lastItem = {key:`${item.isoDate}:${item.title}`, timestamp:timestamp, item:item};
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

			this.mqtt.subscribe(`${this.argv.topic}/#`);

			this.mqtt.on(`${this.argv.topic}/:name`, (topic, message, args) => {
				try {
					if (message == '') {
						this.debug(`Removed topic ${topic}...`);
						delete this.feeds[args.name];
					}
					else {
						try {
							let config = JSON.parse(message);
							this.feeds[args.name] = {url:config.url, name:args.name, cache:{}};

							this.update();
						}
						catch(error) {
							throw new Error(`Invalid configuration "${message}".`);
						}
		
	
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
