// app.js

// --- 1. IMPORTACIONES Y CONFIGURACIÓN INICIAL ---
const express = require("express"),
  mongoose = require("mongoose"),
  passport = require("passport"),
  LocalStrategy = require("passport-local"),
  passportLocalMongoose = require("passport-local-mongoose"),
  bcrypt = require("bcrypt");

const User = require("./model/User");
const Movie = require("./model/Movies");

const app = express();

// --- 2. CONEXIÓN A LA BASE DE DATOS ---
mongoose
  .connect("mongodb://localhost:27017/Peliculas")
  .then(() => console.log("✅ Conectado exitosamente a MongoDB (Peliculas)"))
  .catch((err) => console.log("❌ Error al conectar a la base de datos:", err));

// --- 3. CONFIGURACIÓN DE EXPRESS Y MIDDLEWARES ---
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

app.use(
  require("express-session")({
    secret: "Rusty is a dog",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

// --- 4. ESTRATEGIA DE AUTENTICACIÓN (LOGIN) ---
// Simplificado: Usamos el método de autenticación que ya trae el plugin en el modelo User
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Middleware para pasar el usuario actual y mensajes a todas las vistas
app.use(function (req, res, next) {
  res.locals.currentUser = req.user;
  next();
});

// --- 5. RUTAS DE AUTENTICACIÓN ---

// REGISTRO
app.get("/register", (req, res) => res.render("register", { error: null }));

app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Encriptamos la contraseña (Hash)
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: "reader", 
    });

    await newUser.save(); // AHORA SOLO UNA VEZ
    
    // Redirigimos al login con el parámetro de éxito
    res.redirect("/login?success=true");
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.render("register", { error: `El ${field} ya está en uso.` });
    }
    res.render("register", { error: "Error al registrar: " + error.message });
  }
});

// LOGIN
app.get("/login", (req, res) => {
  // Capturamos el mensaje de éxito de la URL si existe
  const message = req.query.success ? "¡Registro completado con éxito! Ya puedes iniciar sesión." : null;
  res.render("login", { message: message, error: null });
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", function (err, user, info) {
    if (err) return next(err);
    if (!user) {
      // Si falla, pasamos message como null para evitar el ReferenceError en la vista
      return res.render("login", { error: "Usuario o contraseña incorrectos", message: null });
    }

    req.logIn(user, function (err) {
      if (err) return next(err);
      return res.redirect("/movies");
    });
  })(req, res, next);
});

// LOGOUT
app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);
    res.redirect("/login");
  });
});

// --- 6. RUTAS DE PELÍCULAS (Protección básica) ---

// Middleware de protección
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

app.get("/movies", isLoggedIn, async (req, res) => {
  try {
    const movies = await Movie.find({});
    res.render("movies", { movies });
  } catch (err) {
    res.status(500).send("Error al cargar las películas");
  }
});

// ... (Resto de tus rutas de edición y eliminación se mantienen igual)

app.listen(3000, () => console.log("🚀 Servidor en http://localhost:3000"));