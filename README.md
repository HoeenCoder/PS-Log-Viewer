Pokemon Showdown Log Viewer
========================================================================

A Node js log viewer for Pokemon Showdown.

Setup:
------------------------------------------------------------------------

1. Clone with git or download the files, and place the root folder in the same directory as your server's root folder.
2. Take the `log-viewer.js` file and place it in your servers chat-plugins folder.
3. Start the log viewer server with `node server.js`. The first time you do this it will install dependencies and then stop.
4. Modify `config.js` to your liking. Make sure that `serverDir` points directly to your server's root folder or the log-viewer won't work.
5. Start the log viewer server again.
6. Make sure `logchat` is set to `true` in your pokemon-showdown server's `config.js` file or else there will be no logs to view.
7. Use `/hotpatch chat` OR restart your pokemon-showdown server so tokens for the log viewer can be generated.

Use:
------------------------------------------------------------------------

1. Create a token on the pokemon-showdown server with `/token` (Requires that you are a global staff member on the server)
2. Use the token to login and view logs. Select the room's logs you want to view, then what month and day. Use the `Next Day` and `Previous Day` to quickly switch between days.
3. Pokemon-Showdown Server Admins Only! Use `Reload Rooms` to reload the log viewers copy of `chatrooms.json`. Use `Update log-viewer Server` to use git to get the latest version of this log viewer (requires that you used git to clone this). Use `Restart log-viewer Server` to stop the server.

Troubleshooting / FAQ:
------------------------------------------------------------------------

Q: My token is always invalid no matter how many times I re-generate it.
- A: Is your IP changing? This can happen if the log viewer is hosted on some platforms such as C9. In this case you should set `auth2` to false in `config.js` on the log viewer.

Q: My token is expiring too quickly.
- A: Tokens by default expire after 30 minutes. The `expires` in `config.js` on the log viewer is the time a token will be good for after its generation **in milliseconds**. Be sure to not set it to something like 30 or 600 as tokens will expire in under a second! If its already in milliseconds try increasing the time it takes to expire.

Q: The server won't start. It keeps saying `No logs found! Is the server file path set correctly? Couldn't find logs at "pokemon-showdown/logs/"` (or something very similar).
- A: You probably didn't set `serverDir` in the log viewers `config.js` correctly. Make sure that when you set that it points to the root folder of your pokemon-showdown server. An example may help explain it:
```
pokemon-showdown >
  config/
  logs/
  app.js
log-viewer >
  client/
  server.js
  config.js
```

In this situation `serverDir` should be set to `../pokemon-showdown/`

Q: My rank is global bot on the server and I can't generate a token / access the log viewer
- A: The log viewer doesn't support the bot rank at this time, its meant to be used by humans.

Q: Which ranks can view what logs?
A: Drivers (%) can view Public room logs. Moderators (@) can view Public and Hidden room logs. Leaders (&) can view Public, Hidden, and Secret room logs. Administrators (~) can view Public, Hidden, Secret, and Deleted room logs. All ranks can also view Groupchat room logs regardless of if the room is expired or not.

Q: Can I contribute to / report a bug with this log viewer?
- A: Yes, feel free to open a new [issue](https://github.com/HoeenCoder/PS-Log-Viewer/issues) for bugs, and open a [pull request](https://github.com/HoeenCoder/PS-Log-Viewer/pulls) for contributing. You can also contact me on [Pokemon Showdown](https://play.pokemonshowdown.com), I use the name `HoeenHero`, just hit the `Find a User` button, type in my username and (if I'm not offline) hit chat to talk to me.

Q: My question isn't answered here.
- A: You can contact me on [Pokemon Showdown](https://play.pokemonshowdown.com), I use the name `HoeenHero`, just hit the `Find a User` button, type in my username and (if I'm not offline) hit chat to talk to me. I'm not going to help you setup a pokemon-showdown server though, and probably won't help you setup this log viewer either. If I helped everyone I wouldn't have any time to do anything else.

Special Thanks to anyone who has contributed to this!
