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
const GoogleStrategy = require('passport-google-oauth20').Strategy;

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
app.use(passport.initialize());//initialize passport middleware
app.use(passport.session());//our app uses persistent login session so this middleware must be use

//connect to mongoDB
main().catch(err => console.log(err));
async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/userDB');
}
//create mongoose schema
const userSchema = new mongoose.Schema({
  username : String,
  password : String,
  twitterId:String,
  googleId:String,
  secret: String,
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
  callbackURL:process.env.twitter_CALLBACK_URL//callback URL
  },(accessToken, refreshToken,profile, cb)=>{//accessToken proves user's identity
    //refreshToken used to obtain new access token when current one expires.
    console.log(profile)//log user information to console
      User.findOrCreate({twitterId:profile.id},(err,user)=>{//appended an existed object or create new one
        return cb(err,user);//this callback provided as argument to twitterStrategy constructor
      });
    }
));

//use googleStrategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'http://localhost:3000/auth/google/secrets',
}, (accessToken, refreshToken,profile, cb) => {
  console.log(profile)
  User.findOrCreate({ googleId: profile.id }, (err, user) => {
    return cb(err, user);
  });
}));


//authenticate request with twitter
app.get('/auth/twitter',
//initialize authenticate process by twitter strategy
  passport.authenticate('twitter',  { failureRedirect: '/' })
);

//url which user will be redirect after authenticate with twitter
app.get(
  '/auth/twitter/secrets',
  passport.authenticate('twitter', {
    failureRedirect: '/login',
    scope: ['tweet.read', 'tweet.write', 'users.read'],//specify permission that application require from user
  }),
  function (req, res) {
    // Successful authentication, redirect to secrets route.
    res.redirect('/secrets');
  }
);

// authenticate request with google
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] })//google require scope when signin
);

// user which user will be redirect after authenticate with google
app.get('/auth/google/secrets',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication, redirect to secrets page
    res.redirect('/secrets');
  }
);

app.get('/',(req,res)=>{
  res.render('home')
});

//
app.get('/register/google',(req,res)=>{
  res.redirect('/auth/google')
});

//after success authentication, google redirect user back to application using callback 
app.get('/register/google/callback', async (req, res) => {
  try {
    const googleProfile = req.user;
    const existingUser = await User.findOne({ googleId: googleProfile.id });

    if (existingUser) {
      res.render('register', { error: 'An account with this Google profile already exists. Please log in.' });
    } else {
      // Continue with the registration process
      const newUser = new User({
        username: googleProfile.displayName,
        googleId: googleProfile.id,
      });

      await newUser.save();
      res.redirect('/secrets');
    }
  } catch (error) {
    console.log(error);
    res.redirect('/register');
  }
});


app.get('/register/twitter',(req,res)=>{
  res.redirect('/auth/twitter')
});

app.get('/register/twitter/callback', async (req, res) => {
  try {
    const twitterProfile = req.user;
    const existingUser = await User.findOne({ twitterId: twitterProfile.id });

    if (existingUser) {
      res.render('register', { error: 'An account with this Twitter profile already exists. Please log in.' });
    } else {
      const newUser = new User({
        username: twitterProfile.displayName,
        twitterId: twitterProfile.id,
      });

      await newUser.save();
      res.redirect('/secrets');
    }
  } catch (error) {
    console.log(error);
    res.redirect('/register');
  }
});


app.get('/login',(req,res)=>{
  res.render('login');
});

//Login with local strategy.
app.post('/login',async (req,res)=>{
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
    if(error.name === 'UserExistsError'){
      res.render('register',{error: 'Username already exists. Please choose a different username.',})
    }else{
      console.log(error);
      res.redirect('/register');
    }
  }
});


app.get("/secrets", async (req, res) => {
  try {
    const foundUsers = await User.find().exec();//wait for find user in database
    if (foundUsers) {
      res.render('secrets', { usersWithSecrets: foundUsers });
    } else {
      res.status(404).send('No users found with secrets');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred');
  }
});
app.get('/logout',(req,res)=>{
  req.logOut();
  res.render('home')
})

app.get('/submit',(req,res)=>{
  res.render('submit')
})

app.get("/submit", function(req, res){
  if (req.isAuthenticated()){
    res.render("submit");
  } else {
    res.redirect("/login");//user is not authenticated, redirect to login
  }
});

app.post("/submit", async(req, res)=>{
  const submittedSecret = req.body.secret;
  try {
    const foundUser = await User.findById(req.user.id).exec();//wait for find user
    if(foundUser){
      foundUser.secret = submittedSecret;//assign secret for user s
      await foundUser.save();
      res.redirect('/secrets')
    }else(
      res.status(404).send('user not found /submit route failure')
    )
  } catch (error) {
    console.error(error)
    res.status(500).send('an error occurred')
  }
});

app.listen(port, () => {
  console.log(`Secrets app listening on port ${port}`)
})
