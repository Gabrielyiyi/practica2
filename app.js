// app.js

// --- 1. IMPORTACIONES Y CONFIGURACIÓN INICIAL ---
const express = require("express"),
  mongoose = require("mongoose"),
  passport = require("passport"),
  LocalStrategy = require("passport-local"),
  passportLocalMongoose = require("passport-local-mongoose"),
  bcrypt = require("bcrypt"); // Para encriptar contraseñas

const User = require("./model/User");
const Movie = require("./model/Movies");

const app = express();

// --- 2. CONEXIÓN A LA BASE DE DATOS ---
mongoose
  .connect("mongodb://localhost:27017/Peliculas")
  .then(() => console.log("✅ Conectado exitosamente a MongoDB (Peliculas)"))
  .catch((err) => console.log("❌ Error al conectar a la base de datos:", err));

// --- 3. CONFIGURACIÓN DE EXPRESS Y MIDDLEWARES ---
app.set("view engine", "ejs"); // Usar EJS como motor de plantillas
app.use(express.urlencoded({ extended: true })); // Para procesar datos de formularios

// Configuración de sesiones (mantiene a los usuarios logueados de forma segura)
app.use(
  require("express-session")({
    secret: "Rusty is a dog",
    resave: false,
    saveUninitialized: false,
  })
);

// Inicializar Passport (Sistema de Autenticación)
app.use(passport.initialize());
app.use(passport.session());

// --- 4. ESTRATEGIA DE AUTENTICACIÓN (LOGIN) ---
// Aquí le enseñamos a Passport cómo validar a un usuario cuando intenta iniciar sesión
passport.use(
  new LocalStrategy(async function (username, password, done) {
    try {
      // 1. Buscamos si el usuario existe en la base de datos
      const user = await User.findOne({ username: username });
      if (!user) return done(null, false, { message: "Usuario no encontrado" });

      // 2. Verificamos la contraseña
      let isMatch = false;
      if (user.password && user.password.startsWith("$2b$")) {
        // Si la contraseña ya está encriptada, la comparamos
        isMatch = await bcrypt.compare(password, user.password);
      } else {
        // Si es una contraseña vieja en texto plano, la aceptamos y la encriptamos para el futuro
        if (user.password === password) {
          isMatch = true;
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(password, salt);
          await user.save();
        }
      }

      // 3. Devolvemos el resultado del login
      if (isMatch) return done(null, user); // Éxito
      else return done(null, false, { message: "Contraseña incorrecta" }); // Fallo
    } catch (err) {
      return done(err);
    }
  })
);

// Serializar y deserializar usuario (Guardar y leer la sesión en las cookies del navegador)
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Middleware Global: Hace que la variable 'currentUser' esté disponible en TODOS los archivos EJS
// Así podemos mostrar el nombre del usuario o botones distintos según si está logueado o no.
app.use(function (req, res, next) {
  res.locals.currentUser = req.user;
  next();
});

// --- 5. CONTROL DE ACCESOS (ROLES Y PERMISOS) ---

// Verifica si el usuario inició sesión
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

// Verifica si el usuario tiene permisos para editar/crear (Editor o Superusuario)
function isEditor(req, res, next) {
  if (req.isAuthenticated() && (req.user.role === "editor" || req.user.role === "superuser")) {
    return next();
  }
  res.status(403).send("Acceso denegado: Se requieren permisos de Editor.");
}

// --- 6. RUTAS DE AUTENTICACIÓN ---

// Página de inicio
app.get("/", (req, res) => res.render("home"));

// Mostrar formulario de registro
app.get("/register", (req, res) => res.render("register", { error: null }));

// Procesar el registro de un nuevo usuario en la base de datos
app.post("/register", async (req, res) => {
  try {
    if (!req.body.username || !req.body.email || !req.body.password) {
      return res.render("register", { error: "Todos los campos son obligatorios." });
    }

    // Encriptar la contraseña antes de guardarla por seguridad
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    const newUser = new User({
      username: req.body.username,
      email: req.body.email,
      role: "reader", // Rol por defecto para nuevos registros
      password: hashedPassword,
    });

    await newUser.save();
    res.redirect("/login");
  } catch (error) {
    // Si el error es 11000, significa que el usuario o correo ya existe en MongoDB
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.render("register", { error: `El ${field} ya está en uso.` });
    }
    res.render("register", { error: "Error al registrar: " + error.message });
  }
});

// Mostrar formulario de login
app.get("/login", (req, res) => res.render("login"));

// Procesar el login
app.post("/login", (req, res, next) => {
  passport.authenticate("local", function (err, user, info) {
    if (err) return next(err);
    if (!user) return res.render("login", { error: info.message }); // Si falla, mostrar error en pantalla

    req.logIn(user, function (err) {
      if (err) return next(err);
      return res.redirect("/movies");
    });
  })(req, res, next);
});

// Procesar el cierre de sesión
app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

// --- 7. RUTAS DE PELÍCULAS (CRUD) ---

// LEER (READ): Muestra todas las películas y permite buscar
app.get("/movies", isLoggedIn, async (req, res) => {
  let query = {};
  if (req.query.q) {
    // Búsqueda inteligente ignorando mayúsculas y minúsculas ($regex y $options: "i")
    query = { Name: { $regex: req.query.q, $options: "i" } }; 
  }
  const movies = await Movie.find(query);
  res.render("movies", { movies, searchQuery: req.query.q || "" });
});

// CREAR (CREATE) - Vista: Muestra el formulario vacío
app.get("/movies/new", isEditor, (req, res) => res.render("new-movie"));

// CREAR (CREATE) - Lógica: Guarda la nueva película en la base de datos
app.post("/movies", isEditor, async (req, res) => {
  try {
    // Convertimos el string de actores separados por coma a un Arreglo (Array)
    const actorsArray = req.body.Actors ? req.body.Actors.split(",").map((actor) => actor.trim()) : [];
    // Asociamos la película al usuario que la está creando (owner) para permisos futuros
    const newMovie = { ...req.body, Actors: actorsArray, owner: req.user._id };
    await Movie.create(newMovie);
    res.redirect("/movies");
  } catch (err) {
    res.status(400).send(`<h2>Error al crear la película</h2><p>${err.message}</p><a href='/movies/new'>Volver atrás</a>`);
  }
});

// BORRAR (DELETE): Elimina una película solo si eres el dueño original o un superusuario
app.post("/movies/:id/delete", isEditor, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.redirect("/movies");

    // Validar que quien intenta borrar sea el dueño o el administrador principal
    if (req.user.role === "superuser" || (movie.owner && movie.owner.equals(req.user._id))) {
      await Movie.findByIdAndDelete(req.params.id);
    }
    res.redirect("/movies");
  } catch (err) {
    res.redirect("/movies");
  }
});

// ACTUALIZAR (UPDATE) - Vista: Muestra formulario rellenado con los datos actuales
app.get("/movies/:id/edit", isEditor, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (req.user.role !== "superuser" && (!movie.owner || !movie.owner.equals(req.user._id))) {
      return res.status(403).send("Acceso denegado: Solo puedes editar tus propias películas.");
    }
    res.render("edit", { movie });
  } catch (err) {
    res.redirect("/movies");
  }
});

// ACTUALIZAR (UPDATE) - Lógica: Sobreescribe los datos nuevos en la base de datos
app.post("/movies/:id/edit", isEditor, async (req, res) => {
  try {
    const checkMovie = await Movie.findById(req.params.id);
    if (req.user.role !== "superuser" && (!checkMovie.owner || !checkMovie.owner.equals(req.user._id))) {
      return res.status(403).send("Acceso denegado: Solo puedes editar tus propias películas.");
    }

    const actorsArray = req.body.Actors ? req.body.Actors.split(",").map((actor) => actor.trim()) : [];
    const updatedMovie = { ...req.body, Actors: actorsArray };

    // runValidators: true obliga a Mongoose a respetar las reglas del schema al actualizar
    await Movie.findByIdAndUpdate(req.params.id, updatedMovie, { runValidators: true });
    res.redirect("/movies");
  } catch (err) {
    res.status(400).send(`<h2>Error al editar la película</h2><p>${err.message}</p><a href='/movies/${req.params.id}/edit'>Volver atrás</a>`);
  }
});

// --- 8. ARRANQUE DEL SERVIDOR ---
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", function () {
  console.log("🚀 Servidor en línea: http://localhost:3000 (Accesible por red local)");
});
