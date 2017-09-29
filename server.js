/**
 * PS Log Viewer
 * Main File
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

const RANK_ORDER = ['%', '@', '&', '~'];
const BENCHMARKS = [100, 300, 500, 1000, 10000];
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

function escapeHTML(str) {
	if (!str) return '';
	return ('' + str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\//g, '&#x2f;');
}

function escapePhrase(str) {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function canView(room, id) {
	if (!authSockets[id]) return false;
	let rank = authSockets[id].rank;
	if (!room.startsWith('groupchat-')) room = toId(room);
	if (!room) return false;
	let existingRooms = Rooms.map(r => {
		return toId(r.title);
	});
	if (existingRooms.indexOf(room) > -1) {
		room = Rooms[existingRooms.indexOf(room)];
		if (room.isPrivate && room.title !== 'Staff' && rank === '%') return false;
		if (room.isPrivate === true && room.title !== 'Staff' && rank === '@') return false;
		if (room.modjoin && (RANK_ORDER.indexOf(rank) < RANK_ORDER.indexOf(room.modjoin)) && rank !== '~') return false;
	} else {
		if (!fs.existsSync(Config.serverDir + 'logs/chat/' + room)) return false;
		if (room.startsWith('groupchat-')) return true;
		if (rank !== '~') return false;
	}
	return true;
}

function getRoomList(id) {
	let rank = authSockets[id].rank;
	let out = {
		'official': [],
		'public': [],
		'hidden': [],
		'secret': [],
		'deleted': [],
		'groupchats': [],
	};
	if (!(rank in {
			'%': 1,
			'@': 1,
			'&': 1,
			'~': 1,
		})) return out;
	let rooms = fs.readdirSync(Config.serverDir + 'logs/chat');
	let existingRooms = Rooms.map(r => {
		return toId(r.title);
	});
	for (let r = 0; r < rooms.length; r++) {
		if (fs.statSync(Config.serverDir + 'logs/chat/' + rooms[r]).isFile()) continue;
		if (rooms[r].startsWith('groupchat-')) {
			out.groupchats.push(rooms[r]);
			continue;
		}
		if (existingRooms.indexOf(rooms[r]) === -1) {
			if (rank === '~') out.deleted.push(rooms[r]);
			continue;
		}
		let room = Rooms[existingRooms.indexOf(rooms[r])];
		if (room.isPrivate) {
			if (room.title === 'Staff') {
				out.official.push(room.title);
				continue;
			}
			if (room.title === 'Upper Staff' && (rank === '&' || rank === '~')) {
				out.official.push(room.title);
				continue;
			}
			if (rank === '%') continue;
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
				if (rank === '@') continue;
				if (room.isOfficial) {
					out.official.push(room.title);
				} else {
					out.secret.push(room.title);
				}
			}
		} else {
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
	return ' ';
}

function checkToken(token, id, ip) {
	let tokens = JSON.parse(fs.readFileSync(Config.serverDir + 'config/log-tokens.json'));
	if (tokens[token]) {
		if (!tokens[token].expires || (tokens[token].expires + Config.expires) < Date.now()) return null;
		let rank = checkAuth(tokens[token].name);
		if (!(rank in {
				'%': 1,
				'@': 1,
				'&': 1,
				'~': 1,
			})) return false;
		if (Config.auth2 && ip !== tokens[token].ip) return false;
		authSockets[id] = {
			name: tokens[token].name,
			userid: toId(tokens[token].name),
			socketid: id,
			rank: rank,
			ip: ip,
		};
		return rank + tokens[token].name;
	} else {
		return false;
	}
}

function search (id, level, phrase, room, month, day) {
	phrase = toId(phrase);
    if (!phrase) return 'No search phrase provided.';
    if (!id || !authSockets[id]) return 'Access Denied - Unable to authenticate for search.';
    if (!level) level = 0;
    if (level > BENCHMARKS.length - 1) level = BENCHMARKS.length - 1;
    if (room && !canView(room, id)) return 'Access Denied for searching logs of room "' + room + '"';
    //if (room) return this.singleRoomSearch(id, level, room, month, day);
    let list = fs.readdirSync(Config.serverDir + 'logs/chat');
    let lines = [];
    console.log(phrase);
    let exp = new RegExp(escapePhrase(phrase), 'i');
    for (let r = 0; r < list.length; r++) {
    	if (fs.statSync(Config.serverDir + 'logs/chat/' + list[r]).isFile()) continue;
        if (!canView(list[r], id)) continue;
        let months = fs.readdirSync(Config.serverDir + 'logs/chat/' + list[r]);
        for (let m = 0; m < months.length; m++) {
        	if (fs.statSync(Config.serverDir + 'logs/chat/' + list[r] + '/' + months[m]).isFile()) continue;
            let days = fs.readdirSync(Config.serverDir + 'logs/chat/' + list[r] + '/' + months[m]);
            for (let d = 0; d < days.length; d++) {
                let cur = fs.readFileSync(Config.serverDir + 'logs/chat/' + list[r] + '/' + months[m] + '/' + days[d], 'utf-8').split('\n');
                for (let l = 0; l < cur.length; l++) {
                    if (lines.length >= BENCHMARKS[level]) return lines.join('\n');
                    if (exp.test(cur[l])) lines.push('[' + list[r] + ' on ' + days[d].substring(0, days[d].length - 4) + '] ' + cur[l]);
                }
            }
        }
    }
    if (!lines.length) lines.push('No Results');
    return lines.join('\n');
};

app.use(express.static(path.resolve(__dirname, 'client')));

io.on('connection', function(socket) {
	socket.on('authenticate', function(token) {
		let ip = socket.request.connection.remoteAddress.substring(7);
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
			fs.readdir(Config.serverDir + 'logs/chat/' + room, (err, months) => {
				if (err) {
					console.log(err);
					return socket.emit('error', 'An error has occured on the log-viwer server.');
				}
				socket.emit('pickMonth', JSON.stringify(months));
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
				socket.emit('logs', escapeHTML(txt), options);
			});
		} else {
			socket.emit('errorMsg', 'Access Denied.');
		}
	});
	
	// Searching commands
	
	socket.on('searchAll', function(level, phrase) {
		let out = search(socket.id, (level || 0), phrase);
		socket.emit('search', escapeHTML(out), {level: level, phrase: phrase});
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
