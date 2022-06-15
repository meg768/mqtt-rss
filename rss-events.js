#!/usr/bin/env node

var Parser = require('rss-parser');
var Events = require('events');

module.exports = class RssParserEmitter extends Events {

	constructor(options) {

		super(options);

		let {debug = false, log = console.log, transformRSS = (item) => item, autostart = true, event = 'rss', feeds, interval = 5} = options;

		if (feeds == undefined) {
			throw new Error(`Need to specify RSS feeds.`);
		}
		
		this.debug = () => {};
		this.event = event;
		this.feeds = feeds;
		this.interval = interval;
		this.log = log;
		this.timeout = null;
		this.transformRSS = transformRSS;
		this.cache = {};

		if (typeof debug == 'function')
			this.debug = debug;
		else if (debug)
			this.debug = console.debug

		if (autostart)
			this.start();
	}

    async fetchURL(url) {

		this.debug(`Fetching ${url}...`);

		let parser = new Parser();
		let result = await parser.parseURL(url);

		for (let item of result.items) {
			item.pubDate = new Date(item.pubDate); 
			item.isoDate = new Date(item.isoDate); 
		}

		result.items.sort((A, B) => {
			return B.isoDate.getTime() - A.isoDate.getTime();

		});

		return result.items[0];
    }


	async fetch() {

		try {
			let headlines = [];

			for (const [name, url] of Object.entries(this.feeds)) {

				try {
					let rss = await this.fetchURL(url);
					let cache = this.cache[name];

					if (cache == undefined || cache.isoDate < rss.isoDate) {
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
				return a.rss.isoDate.valueOf() - b.rss.isoDate.valueOf();
			});
			
			for (let headline of headlines) {
				this.emit(this.event, headline.name, this.transformRSS(headline.rss));
			}

		}
		catch(error) {
			this.log(error);

		}

	}


	async loop() {
		try {
			await this.fetch();
		}
		catch (error) {
			this.log(error);
		}
		finally {
			this.stop();
			this.timeout = setTimeout(this.loop.bind(this), this.interval * 1000 * 60);
		}
	}

	start() {
		this.stop();
		this.loop();
	}

	stop() {
		if (this.timeout != null)
			clearTimeout(this.timeout);

		this.timeout = null;
	}

}
