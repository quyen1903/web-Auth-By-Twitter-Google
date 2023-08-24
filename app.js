require('dotenv').config();
const express = require('express');
const port = 3000;
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const passport = require('passport');
const session = require('express-session')
const app = express();
const passportLocalMongoose = require('passport-local-mongoose');
const findOrCreate = require('mongoose-findorcreate');
const twitterStrategy = require('passport-twitter').Strategy;


app.set('view engine','ejs');
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: "sessionSecret",
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

main().catch(err => console.log(err));
async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/twitter');
}

const userSchema = new mongoose.Schema({
  username : String,
  password : String,
  twitterId:String,
})

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model('User',userSchema)

passport.use(User.createStrategy());

passport.serializeUser((user,done)=>{
  done(null,user.id)
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => {
      done(null, user);
    })
    .catch(err => {
      done(err, null);
    });
});
passport.use(new twitterStrategy({
  consumerKey:process.env.TWITTER_CONSUMER_KEY,
  consumerSecret:process.env.TWITTER_CONSUMER_SECRET,
  callbackURL:process.env.twitter_CALLBACK_URL
  },(accessToken,refreshToken,profile,cb)=>{
    console.log(profile)
      User.findOrCreate({twitterId:profile.id},(err,user)=>{
        return cb(err,user);
      });
    }
));

app.get('/',(req,res)=>{
  res.render('home')
});
//redirect user to services provider
app.get('/auth/twitter',
  passport.authenticate('twitter',  { failureRedirect: '/' })
);
//url which user will be redirect after authenticate with provider
app.get(
  '/auth/twitter/secrets',
  passport.authenticate('twitter', {
    failureRedirect: '/login',
    scope: ['tweet.read', 'tweet.write', 'users.read'],
  }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect('/secrets');
  }
);


app.get('/login',(req,res)=>{
  res.render('login');
});

app.get('/register',(req,res)=>{
  res.render('register');
});

app.post('/register', async (req, res) => {
  try {
    const user = new User({ username: req.body.username });
    await User.register(user, req.body.password);
    passport.authenticate("local")(req, res, () => {
      res.redirect("/secrets");
    });
  } catch (error) {
    console.log(error);
    res.redirect('/register');
  }
});

app.get("/secrets",(req,res)=>{
  if(req.isAuthenticated()){
    res.render('secrets')
  }else{
    res.redirect('/')
  }
});

app.listen(port, () => {
    console.log(`Twitter app listening on port ${port}`)
  })