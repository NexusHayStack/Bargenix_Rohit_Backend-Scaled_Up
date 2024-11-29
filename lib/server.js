/*
 * Server-related tasks 
 *
 */

//Dependencies
var http = require('http');
var https = require('https');
var url = require('url');
var fs = require('fs');
var StringDecoder = require('string_decoder').StringDecoder;
var path = require('path');
var handlers = require('./handlers');
var helpers = require('./helpers');


var server = {};

// Instantiate the HTTP server
server.httpServer = http.createServer(function(req,res){
	server.unifiedServer(req,res);
});


// Instantiate the HTTPS server
server.httpsServerOptions = {
	'key' : fs.readFileSync(path.join(__dirname,'/../https/key.pem')),
	'cert' : fs.readFileSync(path.join(__dirname,'../https/cert.pem'))
};

server.httpsServer = https.createServer(server.httpsServerOptions,function(req,res){
	server.unifiedServer(req,res);
});

server.unifiedServer = function(req,res){

	// Parse and dis-assemble the request
	parsedUrl = url.parse(req.url,true);

	var path = parsedUrl.pathname;
	var trimmedPath = path.replace(/^\/+|\/+$/g,'');

	var queryStringObject = parsedUrl.query;

	var method = req.method.toUpperCase();

	var headers = req.headers;

	// Get the payload, if any
	var decoder = new StringDecoder('utf-8')		/* decoder object to decode a utf-8 to a string */
	var buffer = '';							    
	req.on('data', function(data){					/* takes the 'data', when 'data' event is emitted by the 'req' object, and plug it in a call back function */
		buffer += decoder.write(data);			    /* appending the stream of decoded 'data' to buffer "bit-by-bit"*/
	});

	// Stop the binding on the end of the stream
	req.on('end', function(){						/* This function stops appending the string when the 'end' event of the stream is detected, i.e. it will be executed weather there is a payload or not*/
		buffer += decoder.end();

		// Choose the handler this request should go to. If one is not found, use the notFound handler.
		var chosenHandler = typeof(server.router[trimmedPath]) !== 'undefined' ? server.router[trimmedPath] : handlers.notFound;

		// If the request is within the public directory, use the public handler instead
		chosenHandler = trimmedPath.indexOf('public/') > -1 ? handlers.public : chosenHandler; 

		// Construct the data object to send to the handler
		var data = {
			'trimmedPath' : trimmedPath,
			'queryStringObject' : queryStringObject,
			'method' : method,
			'headers' : headers,
			'payload' : helpers.parseJsonToObject(buffer)
		}

		// Route the request to the handler specified in the router
		chosenHandler(data,function(statusCode,payload){
			//Use the status code called back by the handler, or default to 200
			statusCode = typeof(statusCode) == 'number' ? statusCode : 200;

			// Use the payload called back by the handler, or default to an empty object
			payload = typeof(payload) == 'object' ? payload : {};
			

			//Convert the payload to a string
			var payloadString = JSON.stringify(payload);

			// Send the response
				// Sending a 'Header Content' = json, telling the client browser that server is sending a json type
			res.setHeader('Content-Type','application/json');
			res.writeHead(statusCode);
			res.end(payloadString);

			// Log the requested payload
			console.log(trimmedPath,statusCode);

			// Log the requested path
			// If the response is 200, print green otherwise print red
			if(statusCode == 200){
				console.log('\x1b[32m%s\x1b[0m','Returning this response: '+method.toUpperCase()+' /'+trimmedPath+' '+statusCode,payloadString);
			} else {
				console.log('\x1b[31m%s\x1b[0m','Returning this response: '+method.toUpperCase()+' /'+trimmedPath+' '+statusCode,payloadString);
			}
			
		});
	});

};

// Define a request router
server.router = {
	'ping' : handlers.ping,
	'users' : handlers.users,
	'tokens' : handlers.tokens,
	'coupons' : handlers.coupons,
	'vendors' : handlers.vendors,
	'products' : handlers.products,
	'buy' : handlers.buy
}

server.init = function(){
	server.httpServer.listen(3000,function(){
	console.log("The Server is now listening on port 3000.");
	});

	server.httpsServer.listen(3001,function(){
		console.log("The Server is now listening on port 3001.");
	});
};

module.exports = server;