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
  await mongoose.connect(process.env.MONGOOSE_CONNECT);
}

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  twitterId: String,
  googleId: String,
  secrets: [
    {
      _id: mongoose.Schema.Types.ObjectId,
      text: String,
    },
  ],
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model('User',userSchema);
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
  },(accessToken, refreshToken,profile, cb)=>{
    
    console.log(profile)
      User.findOrCreate({twitterId:profile.id},(err,user)=>{
        return cb(err,user);
      });
    }
));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, (accessToken, refreshToken,profile, cb) => {
  console.log(profile)
  User.findOrCreate({ googleId: profile.id }, (err, user) => {
    return cb(err, user);
  });
}));

app.get('/auth/twitter',
  passport.authenticate('twitter',  { failureRedirect: '/' })
);

app.get(
  '/auth/twitter/secrets',
  passport.authenticate('twitter', {
    failureRedirect: '/login',
    scope: ['tweet.read', 'tweet.write', 'users.read'],
  }),
  function (req, res) {
    
    res.redirect('/secrets');
  }
);

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] })
);
app.get('/auth/google/secrets',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    
    res.redirect('/secrets');
  }
);

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next(); 
  }
  
  res.redirect('/login');
}

app.get('/',(req,res)=>{
  res.render('home')
});

app.get('/register/google',(req,res)=>{
  res.redirect('/auth/google')
});

app.get('/register/google/callback', async (req, res) => {
  try {
    const googleProfile = req.user;
    const existingUser = await User.findOne({ googleId: googleProfile.id });
    if (existingUser) {
      res.render('register', { error: 'An account with this Google profile already exists. Please log in.' });
    } else {
      
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
app.post('/login',async (req,res)=>{
  try {
    passport.authenticate('local')(req,res,()=>{
      res.redirect('/secrets')
    })
  } catch (error) {
    console.log(error);
    res.redirect('/login')
  }
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
    const foundUsers = await User.find().exec();
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
});

app.get('/submit',(req,res)=>{
  res.render('submit')
});

app.get('/edit/secret/:id', isLoggedIn, async (req, res) => {
  try {
    const secretId = req.params.id;
    const user = req.user; 
    
    const secretToEdit = user.secrets.find((secret) => secret._id.toString() === secretId);
    if (!secretToEdit) {
      return res.status(404).send('Secret not found.');
    }
    res.render('edit', { secret: secretToEdit });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred.');
  }
});

app.post('/edit/secret/:id', isLoggedIn, async (req, res) => {
  try {
    const secretId = req.params.id;
    const updatedSecretText = req.body.updatedSecretText;
    const user = req.user; 
    
    const secretToEdit = user.secrets.find((secret) => secret._id.toString() === secretId);
    if (!secretToEdit) {
      return res.status(404).send('Secret not found.');
    }
    
    secretToEdit.text = updatedSecretText;
    
    await user.save();
    res.redirect('/secrets'); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred.');
  }
});

app.get('/delete/secret/:id', isLoggedIn, async (req, res) => {
  try {
    const secretId = req.params.id;
    const user = req.user; 
    
    const secretToDelete = user.secrets.find((secret) => secret._id.toString() === secretId);
    if (!secretToDelete) {
      return res.status(404).send('Secret not found.');
    }
    res.render('delete', { secret: secretToDelete });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred.');
  }
});

app.post('/delete/secret/:id', isLoggedIn, async (req, res) => {
  try {
    const secretId = req.params.id;
    const user = req.user; 
    
    const secretIndex = user.secrets.findIndex((secret) => secret._id.toString() === secretId);
    if (secretIndex === -1) {
      return res.status(404).send('Secret not found.');
    }
    
    user.secrets.splice(secretIndex, 1);
    
    await user.save();
    res.redirect('/secrets'); 
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred.');
  }
});

app.get("/submit", function(req, res){
  if (req.isAuthenticated()){
    res.render("submit");
  } else {
    res.redirect("/login");
  }
});

app.post('/submit', isLoggedIn, async (req, res) => {
  try {
    const submittedSecret = req.body.secret;
    const user = req.user; 
    
    const newSecret = {
      _id: new mongoose.Types.ObjectId(),
      text: submittedSecret,
    };
    
    user.secrets.push(newSecret);
    
    await user.save();
    res.redirect('/secrets');
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred.');
  }
});

app.listen(port, () => {
  console.log(`Secrets app listening on port ${port}`)
})
