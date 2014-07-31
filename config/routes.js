'use strict';

/**
 * Module dependencies.
 */
var config = require('./config');


var levelup  = require('levelup');
//var db = levelup('/tmp/lvldbtmp.db');
var db = levelup('/tmp/lvldbtmp.db',{valueEncoding:'json'});
var pass = require('pwd');

function splitter(data) {
        return data.split(":",1).toString();
        };

function adder(data) {
        return data.toString() + ':username';
        };

var entries = []


module.exports = function(app) {

  var apiPrefix = config.apiPrefix;

  //Block routes
  var blocks = require('../app/controllers/blocks');
  app.get(apiPrefix + '/blocks', blocks.list);


  app.get(apiPrefix + '/block/:blockHash', blocks.show);
  app.param('blockHash', blocks.block);

  app.get(apiPrefix + '/block-index/:height', blocks.blockindex);
  app.param('height', blocks.blockindex);

  // Transaction routes
  var transactions = require('../app/controllers/transactions');
  app.get(apiPrefix + '/tx/:txid', transactions.show);
  app.param('txid', transactions.transaction);
  app.get(apiPrefix + '/txs', transactions.list);
  app.post(apiPrefix + '/tx/send', transactions.send);

  // Address routes
  var addresses = require('../app/controllers/addresses');
  app.get(apiPrefix + '/addr/:addr', addresses.show);
  app.get(apiPrefix + '/addr/:addr/utxo', addresses.utxo);
  app.get(apiPrefix + '/addrs/:addrs/utxo', addresses.multiutxo);
  app.post(apiPrefix + '/addrs/utxo', addresses.multiutxo);

  // Address property routes
  app.get(apiPrefix + '/addr/:addr/balance', addresses.balance);
  app.get(apiPrefix + '/addr/:addr/totalReceived', addresses.totalReceived);
  app.get(apiPrefix + '/addr/:addr/totalSent', addresses.totalSent);
  app.get(apiPrefix + '/addr/:addr/unconfirmedBalance', addresses.unconfirmedBalance);

  // Status route
  var st = require('../app/controllers/status');
  app.get(apiPrefix + '/status', st.show);

  app.get(apiPrefix + '/sync', st.sync);
  app.get(apiPrefix + '/peer', st.peer);

  // Currency
  var currency = require('../app/controllers/currency');
  app.get(apiPrefix + '/currency', currency.index);

 // Check for username
  app.post('/signup/check/username', function(req, res) {
    var username = req.body.username;
    var usernameTaken = false;
    // check if username contains non-url-safe characters
    if (username !== encodeURIComponent(username)) {
      res.json(403, {
        invalidChars: true
      });
      return;
    }
    // check if username is already taken - query your db here
    db.get(adder(username), function(err, value) {
        if (err) {
          if (err.notFound) {
                //console.log(username + ' not found');
                // looks like everything is fine
                res.send(200);
                return false;
                }
          return console.log('\nErr is: ' + err + '\nValue is: ' + value)
          };
        usernameTaken = true;
        console.log('username found: ' + value);
        res.json(403, { isTaken: true });
        })
  });

        app.post('/signup', function(req, response) {

          var username = req.body.username;
          var email = req.body.email;
          var password = req.body.password;
          var verification = req.body.verification;

          var error = null;
          // regexp from https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L4
          var EMAIL_REGEXP = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,6}$/;
       // check for valid inputs
          if (!username || !email || !password || !verification) {
            error = 'All fields are required';
          } else if (username !== encodeURIComponent(username)) {
            error = 'Username may not contain any non-url-safe characters';
          } else if (!email.match(EMAIL_REGEXP)) {
            error = 'Email is invalid';
          } else if (password !== verification) {
            error = 'Passwords don\'t match';
          }

          if (error) {
            response.status(403);
            console.log('houston we have an error: ' + error);
            //response.render('signup', {
             // error: error
            //});
            return
          }

          // check if username is already taken
          for (var i = 0; i < entries.length; i++) {
                var splitted = entries[i].key.split(":",1);
                if (splitted == username) {
                                usernameTaken = true;
                                break;
                        };
                };

          // create salt and hash password
          pass.hash(password, function(err, salt, hash){
            if (err) console.log(err);

            // yeah we have a new user
            var user = {
              username: username,
              email: email,
              salt: salt,
              hash: hash,
              createdAt: Date.now()
            };
          // for fully featured example check duplicate email, send verification link and save user to db

            //response.redirect('/settings');
            response.redirect('/status');


            //key-value pairs - need to have delimiters for usernames & such
            //lets do: can do things like justin!last_login or justin:last_login
            //for security - non printable characters are better - eg: \x00 (null) through \xff (ÿ)

            var createUser = [
                { type: 'put', key: user.username + ':username', value: user.username },
                { type: 'put', key: user.username + ':email', value: user.email },
                { type: 'put', key: user.username + ':pwdsalt', value: user.salt },
                { type: 'put', key: user.username + ':pwdhash', value: user.hash },
                { type: 'put', key: user.username + ':createdAt', value: user.createdAt }
                ]

            /* ****************
               ** Alternate input - key, value:{ key: value, key: value, key: value }}
               ****************
            db.put(user.username, {
                        pwdsalt: user.salt,
                        pwdhash: user.hash,
                        createdAt: user.createdAt,
                        email: user.email
                        }
                , function(err){
             */

            db.batch(createUser, function(err){
                if(err) throw err;
                });

          });

        });

        app.post('/signin', function(req, response) {
           var username = req.body.signinusername;
    var password = req.body.password;

           var error = null;

           if (!username || !password) {
                error = 'All fields are required';
                };

           if (error) {
                response.status(403);
                response.json(403,{error:error});
                //response.render('signin', {
                //      error: error
                //      });
                return
                }

          db.get(username + ':pwdhash', function(err, value) {
                if (err) {
                  if (err.notFound) {
                        //console.log(username + ' not found');
                        return false;
                        }
                  return console.log(err)
                  };
                var pwdhash = [];
                pwdhash = value;
                db.get(username + ':pwdsalt', function(err, value) {
                        if (err) {
                          if (err.notFound) { return false; }
                          return console.log(err)};
                          var pwdsalt = [];
                          pwdsalt = value;
                          //console.log('pwdhash = ' + pwdhash + '\npwdsalt = ' + pwdsalt)
                          pass.hash(password, pwdsalt, function(err,hash) {
                                if (pwdhash == hash ) {
                                        console.log('signin works');
                                        response.json(200,username);
                                        }
                                else { response.send(403)};
                                })
    			})

                })

                console.log('Password does not verify');

           });



  //Home route
  var index = require('../app/controllers/index');
  app.get(apiPrefix + '/version', index.version);
  app.get('*', index.render);
};
