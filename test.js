#!/usr/bin/env node


class App {

	run() {

		// Function for transforming RSS from the rss-parser
		let transformRSS = (rss) => {
			let title = rss.title;
			let link = rss.link;
			let content = rss.contentSnippet;
			let date = rss.isoDate;
			return {date:date, title:title, content:content, link:link};
		}
		
		let options = {
			// Required. An object with feed name and URL
			feeds: {
				"Aftonbladet":"https://rss.aftonbladet.se/rss2/small/pages/sections/senastenytt",
				"Dagens Industri":"https://digital.di.se/rss",
				"Google":"https://news.google.com/rss?hl=sv&gl=SE&ceid=SE:sv",
				"SvD":"http://www.svd.se/?service=rss",
				"Sveriges Radio":"http://api.sr.se/api/rss/program/83?format=145",
				"Expressen":"https://feeds.expressen.se/nyheter",
				"Sydsvenskan":"http://www.sydsvenskan.se/rss.xml?type=section&id=1594",
				"IDG":"http://feeds.idg.se/idg/vzzs"
			},

			// Optional. Default set to true. No need to call start()
			autostart: false,

			// Optional. Transform RSS JSON to custom format
			transformRSS:transformRSS,

			// Optional. Specifies event name, default is 'rss'
			event: 'news',

			// Optional. Specifies poll interval in minutes. Default is 5.
			interval:1,

			// Optional. A function for logging. Default is console.log
			log:console.log,

			// Optional. A boolean or a function for debug output. Default is false. If true, console.debug is used.
			debug:console.debug
		};

		let RSS = require('./rss-events');
		let rss = new RSS(options);

		rss.on('news', (name, json) => {
			console.log(`${name}: ${JSON.stringify(json, null, '  ')}`);
		});
		
		// Start polling
		rss.start();
		
		// Stop after a while
		setTimeout(() => {rss.stop()}, 10000);
	}
}

let app = new App();
app.run();