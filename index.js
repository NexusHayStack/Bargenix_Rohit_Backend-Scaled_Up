/*
 * Primary file for API 
 *
 */

//Dependencies
var server = require('./lib/server');

// Declare the app 
var app = {};

// Init function
app.init = function(){
	// Start the server
	server.init();

};

// Execute
app.init();


// Export the app 
module.exports = app;