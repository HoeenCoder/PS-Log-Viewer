/**
 * PS Log Viewer
 * Configuration
 */
'use strict';

// Port - The port the log-viewer server will run on.
exports.port = 8080;

// serverDir - the base directory for the server, this should point
// from the location of server.js to the PS server's base directory
exports.serverDir = '../pokemon-showdown/';

// Expires - How long tokens are good for after they are made
exports.expires = 1000 * 60 * 30; // 30 minutes

// 2 Factor Authentication (verify that the IP that created the token is the one using it)
exports.auth2 = true;

// Server Name - The name of the server displayed in the log viewer
exports.serverName = 'Pokemon Showdown';
