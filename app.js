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

//setup ejs 
app.set('view engine','ejs');
app.use(bodyParser.urlencoded({ extended: true }));

//create session middleware
app.use(session({
  secret: "sessionSecret",
  resave: false,
  saveUninitialized: false,
}));

//authenticate middleware 
app.use(passport.initialize());//initialize middleware
app.use(passport.session());//our app uses persistent login session so this middleware must be use

//connect to mongoDB
main().catch(err => console.log(err));
async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/twitter');
}
//create mongoose schema
const userSchema = new mongoose.Schema({
  username : String,
  password : String,
  twitterId:String,
})

//plug passportLocalMongoose and findOrCreate to schema
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

//create User model from userSchema schema
const User = mongoose.model('User',userSchema)


passport.use(User.createStrategy());//setup LocalStrategy 

//serialize and deserialize user help app presistent session to work.
passport.serializeUser((user,done)=>{
  done(null,user.id)
});

//deserialize when subsequent request are made.
passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => {
      done(null, user);
    })
    .catch(err => {
      done(err, null);
    });
});

//use twitterStrategy 
passport.use(new twitterStrategy({//each time user register/login, new instance created
  consumerKey:process.env.TWITTER_CONSUMER_KEY,//API key
  consumerSecret:process.env.TWITTER_CONSUMER_SECRET,//API key secret
  callbackURL:process.env.twitter_CALLBACK_URL//callback
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
//authenticate request with twitter
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

app.post('/login',async (req,res)=>{
  //passport.authenticate('local'): handle authentication. 
  //If authen success, proceed next middleware((req,res,()=>{:), if fail, return unauthorized
  //(req,res,()=>{: callback function provided to passport.authenticate('local').
  //expresss application essentially a series of middleware function call.
  try {
    passport.authenticate('local')(req,res,()=>{
      res.redirect('/secrets')
    })
  } catch (error) {
    console.log(error);
    res.redirect('/login')
  }
})

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
app.get('/logout',(req,res)=>{
  req.logOut();
  res.render('home')
})

app.get('/submit',(req,res)=>{
  res.render('submit')
})

app.listen(port, () => {
    console.log(`Twitter app listening on port ${port}`)
  })