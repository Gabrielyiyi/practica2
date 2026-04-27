// app.js

// --- 1. IMPORTACIONES Y CONFIGURACIÓN INICIAL ---
const express = require("express"),
  mongoose = require("mongoose"),
  passport = require("passport"),
  LocalStrategy = require("passport-local"),
  passportLocalMongoose = require("passport-local-mongoose");

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

// --- 5. RUTA RAÍZ ---
app.get("/", (req, res) => res.redirect("/movies"));

// --- UTILIDADES DE SEGURIDAD ---
// Elimina etiquetas HTML (<script>, <img>, etc.) y operadores NoSQL de MongoDB ($where, $gt...)
function sanitize(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/<[^>]*>/g, "")          // Quita etiquetas HTML: <script>, <b>, etc.
    .replace(/\$[a-zA-Z]+/g, "")     // Quita operadores NoSQL: $where, $gt, $ne...
    .trim();
}

// Aplica sanitize a todos los campos de texto de un objeto
function sanitizeBody(fields) {
  const clean = {};
  for (const key of fields) clean[key] = sanitize(fields[key]);
  return clean;
}

// --- 5. RUTAS DE AUTENTICACIÓN ---

// REGISTRO
app.get("/register", (req, res) => res.render("register", { error: null }));

app.post("/register", async (req, res) => {
  try {
    let { username, email, password } = req.body;

    // Sanitizar entradas
    username = sanitize(username);
    email    = sanitize(email);

    // Validaciones básicas
    if (!username || username.length < 3 || username.length > 30) {
      return res.render("register", { error: "El usuario debe tener entre 3 y 30 caracteres." });
    }
    if (!/^[\w.+-]+@[\w-]+\.[\w.]{2,}$/.test(email)) {
      return res.render("register", { error: "Introduce un correo electrónico válido." });
    }
    if (!password || password.length < 6) {
      return res.render("register", { error: "La contraseña debe tener al menos 6 caracteres." });
    }

    const newUser = new User({ username, email, role: "editor" });
    await User.register(newUser, password);
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

// --- 6. RUTAS DE PELÍCULAS ---

// Middleware: debe estar autenticado
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// Middleware: debe ser editor o superuser
function isEditor(req, res, next) {
  if (req.user && (req.user.role === "editor" || req.user.role === "superuser")) return next();
  res.status(403).send("No tienes permiso para realizar esta acción.");
}

// Middleware: debe ser dueño de la película o superuser
async function isOwner(req, res, next) {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).send("Película no encontrada.");
    if (req.user.role === "superuser" || movie.owner.equals(req.user._id)) {
      req.movie = movie; // guardamos la película para no volver a buscarla
      return next();
    }
    res.status(403).send("No tienes permiso para modificar esta película.");
  } catch (err) {
    res.status(500).send("Error al verificar permisos.");
  }
}

// VER TODAS LAS PELÍCULAS
app.get("/movies", isLoggedIn, async (req, res) => {
  try {
    const searchQuery = req.query.q || "";
    const filter = searchQuery
      ? { Name: { $regex: searchQuery, $options: "i" } }
      : {};
    const movies = await Movie.find(filter);
    res.render("movies", { movies, searchQuery });
  } catch (err) {
    res.status(500).send("Error al cargar las películas");
  }
});

// FORMULARIO NUEVA PELÍCULA
app.get("/movies/new", isLoggedIn, isEditor, (req, res) => {
  res.render("new-movie");
});

// CREAR PELÍCULA
app.post("/movies", isLoggedIn, isEditor, async (req, res) => {
  try {
    const Name     = sanitize(req.body.Name);
    const Year     = parseInt(req.body.Year);
    const Director = sanitize(req.body.Director);
    const Review   = sanitize(req.body.Review);
    const Image    = sanitize(req.body.Image || "");
    const actorsArray = req.body.Actors
      .split(",")
      .map((a) => sanitize(a))
      .filter(Boolean);

    // Validaciones básicas
    if (!Name || Name.length > 200)     return res.status(400).send("Nombre inválido.");
    if (isNaN(Year))                    return res.status(400).send("Año inválido.");
    if (!Director || Director.length > 100) return res.status(400).send("Director inválido.");
    if (!Review || Review.length > 2000)    return res.status(400).send("Reseña inválida.");
    if (actorsArray.length === 0)       return res.status(400).send("Agrega al menos un actor.");

    await Movie.create({ Name, Year, Director, Actors: actorsArray, Review, Image, owner: req.user._id });
    res.redirect("/movies");
  } catch (err) {
    res.status(500).send("Error al crear la película: " + err.message);
  }
});

// FORMULARIO EDITAR PELÍCULA (solo dueño o superuser)
app.get("/movies/:id/edit", isLoggedIn, isEditor, isOwner, (req, res) => {
  res.render("edit", { movie: req.movie });
});

// GUARDAR EDICIÓN (solo dueño o superuser)
app.post("/movies/:id/edit", isLoggedIn, isEditor, isOwner, async (req, res) => {
  try {
    const Name     = sanitize(req.body.Name);
    const Year     = parseInt(req.body.Year);
    const Director = sanitize(req.body.Director);
    const Review   = sanitize(req.body.Review);
    const Image    = sanitize(req.body.Image || "");
    const actorsArray = req.body.Actors
      .split(",")
      .map((a) => sanitize(a))
      .filter(Boolean);

    // Validaciones básicas
    if (!Name || Name.length > 200)     return res.status(400).send("Nombre inválido.");
    if (isNaN(Year))                    return res.status(400).send("Año inválido.");
    if (!Director || Director.length > 100) return res.status(400).send("Director inválido.");
    if (!Review || Review.length > 2000)    return res.status(400).send("Reseña inválida.");
    if (actorsArray.length === 0)       return res.status(400).send("Agrega al menos un actor.");

    await Movie.findByIdAndUpdate(req.params.id, { Name, Year, Director, Actors: actorsArray, Review, Image });
    res.redirect("/movies");
  } catch (err) {
    res.status(500).send("Error al editar la película: " + err.message);
  }
});

// ELIMINAR PELÍCULA (solo dueño o superuser)
app.post("/movies/:id/delete", isLoggedIn, isEditor, isOwner, async (req, res) => {
  try {
    await Movie.findByIdAndDelete(req.params.id);
    res.redirect("/movies");
  } catch (err) {
    res.status(500).send("Error al eliminar la película: " + err.message);
  }
});

app.listen(3000, () => console.log("🚀 Servidor en http://localhost:3000"));