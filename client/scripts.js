var socket = io({
	reconnection: false
});
var rank = '',
	roomRank = '';
var name = '';
var token = '';
var rooms = {};
var curRoom = '';
var curMonth = '',
	monthData = [];
var curDay = '',
	dayData = [];

socket.on('authValid', function(username, json) {
	rank = username.substring(0, 1);
	if (['+', '%', '@', '&', '~'].indexOf(rank) === -1) rank = '';
	if (rank) {
		name = username.substring(1);
	} else {
		name = username;
	}
	try {
		rooms = JSON.parse(json);
	} catch (e) {
		console.log(e);
		document.getElementsByTagName('body')[0].innerHTML = '<span class="header">SpacialGaze Log Viewer</span><br /><br />Your logged in as ' + name + '.<br /><br />Please select what file to view:<br /><br />An error occured when parsing the room list JSON.';
		return;
	}
	buildPage();
});

socket.on('authInvalid', function(expired) {
	if (expired) {
		document.getElementById('authError').innerHTML = 'Your authentication token has expired.<br/>Generate a new one on the server with /token';
	} else {
		document.getElementById('authError').innerHTML = 'Your authentication token was invalid.<br/>Generate one on the server with /token';
	}
});

socket.on('adminReply', function(msg) {
	var ar = document.getElementById('adminReply');
	if (ar) ar.innerText = msg;
	console.log('[Admin Reply] ' + msg);
});

socket.on('errorMsg', function(msg) {
	var ed = document.getElementById('errorMessage');
	if (ed) ed.innerText = msg;
	console.error('[Error] ' + msg);
});

socket.on('logOnly', function(msg, type) {
	if (!type || !(type in {
			"log": 1,
			"warn": 1,
			"error": 1
		})) type = 'log';
	console[type](msg);
});

socket.on('pickMonth', function(data, rank) {
	monthData = JSON.parse(data);
	roomRank = rank;
	buildPage('month', JSON.parse(data));
});

socket.on('pickDay', function(data) {
	dayData = JSON.parse(data);
	buildPage('day', JSON.parse(data));
});

socket.on('logs', function(txt, options) {
	buildPage('logs', txt, options);
});

socket.on('disconnect', function() {
	var ed = document.getElementById('errorMessage');
	if (ed) ed.innerText = 'Disconnected from log-viewer server.';
	var refresh = document.createElement('button');
	refresh.onclick = function(e) {
		window.location.reload();
	};
	refresh.classList += " roomLink";
	refresh.innerText = 'Reload';
	ed.parentNode.insertBefore(refresh, ed.nextSibling);

});

function toId(text) {
	if (text && text.id) {
		text = text.id;
	} else if (text && text.userid) {
		text = text.userid;
	}
	if (typeof text !== 'string' && typeof text !== 'number') return '';
	return ('' + text).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function authenticate() {
	token = document.getElementById('authToken').value.trim();
	socket.emit('authenticate', token);
}

function pickRoom(e) {
	curRoom = e.title;
	if (e.title.startsWith('groupchat-')) {
		socket.emit('selectRoom', e.title);
	} else {
		socket.emit('selectRoom', e.id);
	}
}

function pickMonth(e) {
	curMonth = e.id;
	socket.emit('selectMonth', e.id, curRoom);
}

function pickDay(e) {
	curDay = e.id;
	socket.emit('selectDay', e.id, curMonth, curRoom);
}

function shiftDay(direction) {
	direction = parseInt(direction);
	if (isNaN(direction)) return console.error("shiftDay(): direction is NaN");
	var split = curDay.split('-');
	var d = new Date(parseInt(split[0]), parseInt(split[1]) - 1, parseInt(split[2]));
	d.setDate(d.getDate() + direction);
	if (d.getMonth() + 1 < 10) {
		curMonth = d.getFullYear() + '-0' + (d.getMonth() + 1);
	} else {
		curMonth = d.getFullYear() + '-' + d.getMonth() + 1;
	}
	curDay = curMonth + '-' + d.getDate() + '.txt';
	socket.emit('selectDay', curDay, curMonth, curRoom);
}

function buildPage(type, data, options) {
	var out = '<span class="header">SpacialGaze Log Viewer</span><br /><br />Your logged in as ' + rank + name;
	if (type && roomRank) out += ' ' + roomRank + name + ' in ' + curRoom; 
	out += '.<br /><br />';
	if (rank === '~') out += 'Admin Controls: <button onClick="socket.emit(\'reload\')">Reload roomlist</button> <button onClick="socket.emit(\'update\')">Update log-viewer server</button> <button onClick="socket.emit(\'restart\')">Restart log-viewer server</button><div id="adminReply"></div><br/>';
	out += '<div id="errorMessage"></div> <br/>';
	switch (type) {
		case 'month':
			out += '<button class="roomLink" onClick="buildPage()">All Logs</button> &lt;&lt; <b>' + curRoom + '</b><br/><br/>';
			out += '<span class="header">' + curRoom + '</span><br/><br/>';
			out += 'Please select which month\'s logs to view.<br/><br/>';
			for (var i = 0; i < data.length; i++) {
				if (data[i] === 'today.txt') continue;
				out += '<button class="roomLink" id="' + data[i] + '" onClick="pickMonth(this)">' + data[i] + '</button><br/>';
			}
			out += '<br/>';
			break;
		case 'day':
			out += '<button class="roomLink" onClick="buildPage()">All Logs</button> &lt;&lt; <button class="roomLink" onClick="buildPage(\'month\', monthData)">' + curRoom + '</button> &lt;&lt; <b>' + curMonth + '</b><br/><br/>';
			out += '<span class="header">' + curRoom + '</span><br/><br/>';
			out += 'Please select which day\'s logs to view.<br/><br/>';
			for (var i = 0; i < data.length; i++) {
				out += '<button class="roomLink" id="' + data[i] + '" onClick="pickDay(this)">' + data[i] + '</button><br/>';
			}
			out += '<br/>';
			break;
		case 'logs':
			out += '<button class="roomLink" onClick="buildPage()">All Logs</button> &lt;&lt; <button class="roomLink" onClick="buildPage(\'month\', monthData)">' + curRoom + '</button> &lt;&lt; <button class="roomLink" onClick="buildPage(\'day\', dayData)">' + curMonth + '</button> &lt;&lt; <b>' + curDay + '</b><br/><br/>';
			out += '<span class="header">' + curRoom + '</span><br/><br/>';
			out += 'Viewing logs of room ' + curRoom + ' on ' + curDay.split('.')[0] + '.<br/><hr/>';
			if (options.prev) out += '<button class="shiftDay" id="prevDay" onClick="shiftDay(-1)">Previous Day</button>';
			data = data.split('\n').join('<br/>');
			out += data;
			if (options.next) out += '<button class="shiftDay" id="nextDay" onClick="shiftDay(1)">Next Day</button><br/>';
			break;
		default:
			// Home page
			out += 'Please select which room\'s logs to view:<br /><br />';
			let found = false;
			for (var type in rooms) {
				if (!rooms[type].length) continue;
				found = true;
				if (type === 'groupchats') {
					out += '<details class="header"><summary>' + type.substring(0, 1).toUpperCase() + type.substring(1) + ':</summary>';
				} else {
					out += '<span class="header">' + type.substring(0, 1).toUpperCase() + type.substring(1) + ' rooms:</span><br/><br/>';
				}
				for (var r = 0; r < rooms[type].length; r++) {
					out += '<button class="roomLink" title="' + rooms[type][r] + '" id="' + toId(rooms[type][r]) + '" onClick="pickRoom(this)">' + rooms[type][r] + '</button><br/>';
				}
				if (type === 'groupchats') out += '</details>';
				out += '<br/>';
			}
			if (!found) out += 'Access Denied - You cannot view any rooms.';
	}
	document.getElementsByTagName('body')[0].innerHTML = out;
}

document.getElementById('authForm').addEventListener('submit', function(e) {
	e.preventDefault();
	authenticate();
}, false);
