/**
 * PS Log Viewer
 * Main file
 * Use this file to start the server
 */
'use strict';

// Load Globals

try {
	require('express');
	require('socket.io');
} catch (e) {
	console.error('Dependencies Unmet! Automatically installing them...');
	require('child_process').execSync('npm install --production', {
		stdio: 'inherit'
	});
	console.log('Please restart the server.');
	process.exit(1);
}
const fs = require('fs');
const express = require('express');
const path = require('path');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// Load Configuration

let Config = {};
try {
	Config = require('./config.js');
} catch (e) {
	console.log('config.js not found, creating one from config-example.js');
	fs.writeFileSync(
		path.resolve(__dirname, 'config.js'),
		fs.readFileSync(path.resolve(__dirname, 'config-example.js'))
	);
	Config = require('./config-example.js');
}
try {
	fs.accessSync(Config.serverDir + 'logs/');
} catch (e) {
	console.error('No logs found! Is the server file path set correctly? Couldn\'t find logs at "' + Config.serverDir + 'logs/"');
	process.exit(1);
}

let Rooms = {};
try {
	Rooms = JSON.parse(fs.readFileSync(Config.serverDir + 'config/chatrooms.json', "utf-8"));
} catch (e) {
	console.error('Error while parsing rooms: ' + e);
	process.exit(1);
}

const RANK_ORDER = ['', '+', '%', '@', '&', '~'];
let UPDATE_LOCK = false;
let authSockets = {};
let socketIPs = {};

// Setup Functions

function toId(text) {
	if (text && text.id) {
		text = text.id;
	} else if (text && text.userid) {
		text = text.userid;
	}
	if (typeof text !== 'string' && typeof text !== 'number') return '';
	return ('' + text).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function canView(room, id) {
	if (!authSockets[id]) return false;
	let rank = authSockets[id].rank;
	let userid = authSockets[id].userid;
	if (!room.startsWith('groupchat-')) room = toId(room);
	if (!room) return false;
	let existingRooms = Rooms.map(r => {
		return toId(r.title);
	});
	if (existingRooms.indexOf(room) > -1) {
		room = Rooms[existingRooms.indexOf(room)];
		if (room.auth && room.auth[userid] && room.auth[userid] !== '+' && room.auth[userid] !== '*') return true;
		if (room.isPrivate && room.title !== 'Staff' && rank === '%') return false;
		if (room.isPrivate === true && room.title !== 'Staff' && rank === '@') return false;
		if (room.modjoin && (RANK_ORDER.indexOf(rank) < RANK_ORDER.indexOf(room.modjoin)) && rank !== '~') return false;
	} else {
		if (!fs.existsSync(Config.serverDir + 'logs/chat/' + room)) return false;
		if (room.startsWith('groupchat-') && (rank in {'%': 1, '@': 1, '&': 1, '~': 1})) return true;
		if (rank !== '~') return false;
	}
	return true;
}

function getRoomList(id) {
	let rank = authSockets[id].rank;
	let userid = authSockets[id].userid;
	let out = {
		'official': [],
		'public': [],
		'hidden': [],
		'secret': [],
		'deleted': [],
		'groupchats': []
	};
	let rooms = fs.readdirSync(Config.serverDir + 'logs/chat');
	let existingRooms = Rooms.map(r => {
		return toId(r.title);
	});
	for (let r = 0; r < rooms.length; r++) {
		if (fs.statSync(Config.serverDir + 'logs/chat/' + rooms[r]).isFile()) continue;
		if (rooms[r].startsWith('groupchat-')) {
			if (rank in {'%': 1, '@': 1, '&': 1, '~': 1}) out.groupchats.push(rooms[r]);
			continue;
		}
		if (existingRooms.indexOf(rooms[r]) === -1) {
			if (rank === '~') out.deleted.push(rooms[r]);
			continue;
		}
		let room = Rooms[existingRooms.indexOf(rooms[r])];
		if (room.isPrivate) {
			if (room.title === 'Staff') {
				if (rank in {'%': 1, '@': 1, '&': 1, '~': 1}) out.official.push(room.title);
				continue;
			}
			if (room.title === 'Upper Staff' && (rank === '&' || rank === '~')) {
				if (rank in {'&': 1, '~': 1}) out.official.push(room.title);
				continue;
			}
			if (!(rank in {'@': 1, '&': 1, '~': 1}) && (!room.auth || !room.auth[userid] || room.auth[userid] === '+' || room.auth[userid] === '*')) continue;
			if (room.modjoin) {
				if (RANK_ORDER.indexOf(rank) < RANK_ORDER.indexOf(room.modjoin) && rank !== '~') continue;
			}
			if (room.isPrivate === 'hidden') {
				if (room.isOfficial) {
					out.official.push(room.title);
				} else {
					out.hidden.push(room.title);
				}
			} else {
				if ((!room.auth || !room.auth[userid]) && !(rank in {'&': 1, '~': 1})) continue;
				if (room.isOfficial) {
					out.official.push(room.title);
				} else {
					out.secret.push(room.title);
				}
			}
		} else {
			if ((!rank || rank === '+') && (!room.auth || !room.auth[userid] || room.auth[userid] === '+' || room.auth[userid] === '*')) continue;
			if (room.isOfficial) {
				out.official.push(room.title);
			} else {
				out.public.push(room.title);
			}
		}
	}
	return JSON.stringify(out);
}

function checkAuth(userid) {
	userid = toId(userid);
	let auth = fs.readFileSync(Config.serverDir + 'config/usergroups.csv', "utf-8").split('\n');
	for (let i = 0; i < auth.length; i++) {
		if (toId(auth[i].split(',')[0]) === userid) return auth[i].split(',')[1];
	}
	return '';
}

function getRoomAuth(room, id) {
	let userid = authSockets[id].userid;
	for (let r in Rooms) {
		if (toId(Rooms[r].title) === room) {
			room = Rooms[r];
			break;
		}
	}
	if (!room || typeof room === "string" || !room.auth || !room.auth[userid] || room.auth[userid] === '+' || room.auth[userid] === '*') return '';
	return room.auth[userid];
}

function checkToken(token, id, ip) {
	let tokens = JSON.parse(fs.readFileSync(Config.serverDir + 'config/log-tokens.json'));
	if (tokens[token]) {
		if (!tokens[token].expires || (tokens[token].expires + Config.expires) < Date.now()) return null;
		let rank = checkAuth(tokens[token].name);
		if (rank === '*') rank = '';
		if (Config.auth2 && ip !== tokens[token].ip) return false;
		authSockets[id] = {
			name: tokens[token].name,
			userid: toId(tokens[token].name),
			socketid: id,
			rank: rank,
			ip: ip
		};
		return rank + tokens[token].name;
	} else {
		return false;
	}
}

app.use(express.static(path.resolve(__dirname, 'client')));

io.on('connection', function(socket) {
	socket.on('authenticate', function(token) {
		let ip = socket.request.connection.remoteAddress;
		let result = checkToken(token, socket.id, ip);
		if (result) {
			socket.emit('authValid', result, getRoomList(socket.id));
		} else if (result === null) {
			return socket.emit('authInvalid', true);
		} else {
			return socket.emit('authInvalid', false);
		}
	});
	socket.on('selectRoom', function(room) {
		if (!room.startsWith('groupchat-')) room = toId(room);
		if (canView(room, socket.id)) {
			let roomRank = getRoomAuth(room, socket.id);
			fs.readdir(Config.serverDir + 'logs/chat/' + room, (err, months) => {
				if (err) {
					console.log(err);
					return socket.emit('error', 'An error has occured on the log-viwer server.');
				}
				socket.emit('pickMonth', JSON.stringify(months), roomRank);
			});
		} else {
			socket.emit('errorMsg', 'Access Denied.');
		}
	});
	socket.on('selectMonth', function(month, room) {
		if (!room.startsWith('groupchat-')) room = toId(room);
		if (canView(room, socket.id)) {
			if (!fs.existsSync(Config.serverDir + 'logs/chat/' + room + '/' + month)) return socket.emit('errorMsg', 'Invalid month: ' + month);
			fs.readdir(Config.serverDir + 'logs/chat/' + room + '/' + month, (err, days) => {
				if (err) {
					console.log(err);
					return socket.emit('error', 'An error has occured on the log-viwer server.');
				}
				socket.emit('pickDay', JSON.stringify(days));
			});
		} else {
			socket.emit('errorMsg', 'Access Denied.');
		}
	});
	socket.on('selectDay', function(day, month, room) {
		if (!room.startsWith('groupchat-')) room = toId(room);
		if (canView(room, socket.id)) {
			if (!fs.existsSync(Config.serverDir + 'logs/chat/' + room + '/' + month + '/' + day)) return socket.emit('errorMsg', 'Invalid day: ' + day);
			fs.readFile(Config.serverDir + 'logs/chat/' + room + '/' + month + '/' + day, "utf-8", (err, txt) => {
				if (err) {
					console.log(err);
					return socket.emit('error', 'An error has occured on the log-viwer server.');
				}
				let options = {};
				let daySplit = day.split('-');
				let d = new Date(parseInt(daySplit[0]), parseInt(daySplit[1]) - 1, parseInt(daySplit[2]));
				d.setDate(d.getDate() + 1);
				if (fs.existsSync(Config.serverDir + 'logs/chat/' + room + '/' + month + '/' + (d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' + (d.getMonth() + 1) : d.getMonth() + 1) + '-' + d.getDate() + '.txt'))) options.next = true;
				d.setDate(d.getDate() - 2);
				if (fs.existsSync(Config.serverDir + 'logs/chat/' + room + '/' + month + '/' + (d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' + (d.getMonth() + 1) : d.getMonth() + 1) + '-' + d.getDate() + '.txt'))) options.prev = true;
				socket.emit('logs', txt, options);
			});
		} else {
			socket.emit('errorMsg', 'Access Denied.');
		}
	});

	// Admin commands

	socket.on('restart', function() {
		if (authSockets[socket.id] && authSockets[socket.id].rank === '~') {
			if (UPDATE_LOCK) return socket.emit('adminReply', '[WARNING] The log-viewer server is updating and cannot be stopped at this time.');
			console.log('~' + authSockets[socket.id].name + ' is restarting the log server.');
			socket.emit('adminReply', 'The log-viewer server process was stopped.');
			process.exit();
		}
	});
	socket.on('reload', function() {
		if (authSockets[socket.id] && authSockets[socket.id].rank === '~') {
			console.log('~' + authSockets[socket.id].name + ' reloaded the rooms list.');
			Rooms = JSON.parse(fs.readFileSync(Config.serverDir + 'config/chatrooms.json', "utf-8"));
			socket.emit('adminReply', 'The roomlist was reloaded. Reload the page to see the changes.');
		}
	});
	socket.on('update', function() {
		if (authSockets[socket.id] && authSockets[socket.id].rank === '~') {
			console.log('~' + authSockets[socket.id].name + ' started a log-viewer server update.');
			if (UPDATE_LOCK) socket.emit('adminReply', 'The log-viewer server is already updating! (no further action taken)');
			UPDATE_LOCK = true;
			let exec = require('child_process').exec;
			exec(`git fetch && git rebase --autostash FETCH_HEAD`, (error, stdout, stderr) => {
				if (error) {
					console.error(error);
					socket.emit('logOnly', error, 'error');
					socket.emit('adminReply', '[ERROR] An error occured while updating, check the console for details.');
					UPDATE_LOCK = false;
					return;
				}
				for (let s of ("" + stdout + stderr).split("\n")) {
					console.log(s);
				}
				socket.emit('adminReply', 'The log-viewer server has been updated.');
				UPDATE_LOCK = false;
			});
		}
	});

	// Other

	socket.on('disconnect', function() {
		if (authSockets[socket.id]) delete authSockets[socket.id];
	});
});

http.listen(Config.port, function() {
	console.log('log-viewer server is now listening on port ' + Config.port);
});
