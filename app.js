// app.js
const express = require("express"),
  mongoose = require("mongoose"),
  passport = require("passport"),
  LocalStrategy = require("passport-local"),
  passportLocalMongoose = require("passport-local-mongoose"),
  bcrypt = require("bcrypt"); // Importamos la librería de encriptamiento

const User = require("./model/User");
const Movie = require("./model/Movies"); // Nuevo modelo

let app = express();

mongoose
  .connect("mongodb://localhost:27017/Peliculas")
  .then(() => {
    console.log(
      "✅ Conectado exitosamente a la base de datos MongoDB (Peliculas)",
    );
  })
  .catch((err) => {
    console.log("❌ Error fatal al conectar a la base de datos:");
    console.log(err);
  });

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(
  require("express-session")({
    secret: "Rusty is a dog",
    resave: false,
    saveUninitialized: false,
  }),
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(async function (username, password, done) {
    try {
      // 1. Busca al usuario en la base de datos
      const user = await User.findOne({ username: username });

      // 2. Si no existe el usuario, falla
      if (!user) {
        return done(null, false, { message: "Usuario no encontrado" });
      }

      // 3. Comparamos la contraseña encriptada (o en texto plano si es de los usuarios antiguos)
      let isMatch = false;

      // Si la contraseña guardada en BD comienza con el formato clásico de bcrypt (ej. $2b$) 
      if (user.password && user.password.startsWith("$2b$")) {
        isMatch = await bcrypt.compare(password, user.password);
      } else {
        // Si es un usuario VIEJO que la tiene en texto plano
        if (user.password === password) {
          isMatch = true;

          // ACTUALIZACIÓN SILENCIOSA: Encriptar automática esta contraseña para el futuro
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(password, salt);
          await user.save();
        }
      }

      if (isMatch) {
        return done(null, user); // Login exitoso
      } else {
        return done(null, false, { message: "Contraseña incorrecta" }); // Login fallido
      }
    } catch (err) {
      return done(err);
    }
  }),
);
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Middleware MUY IMPORTANTE: Pasa el usuario actual a TODAS las vistas EJS
app.use(function (req, res, next) {
  res.locals.currentUser = req.user;
  next();
});

// --- MIDDLEWARES DE AUTORIZACIÓN (ROLES) ---
function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/login");
}

function isEditor(req, res, next) {
  if (
    req.isAuthenticated() &&
    (req.user.role === "editor" || req.user.role === "superuser")
  ) {
    return next();
  }
  res.status(403).send("Acceso denegado: Se requieren permisos de Editor.");
}

function isSuperUser(req, res, next) {
  if (req.isAuthenticated() && req.user.role === "superuser") {
    return next();
  }
  res
    .status(403)
    .send("Acceso denegado: Solo el Súper Usuario puede hacer esto.");
}

// --- RUTAS DE AUTENTICACIÓN ---
app.get("/", function (req, res) {
  res.render("home");
});

app.get("/register", function (req, res) {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  try {
    // Validaciones básicas de servidor
    if (!req.body.username || !req.body.email || !req.body.password) {
      return res.render("register", { error: "Todos los campos (usuario, email, contraseña) son obligatorios." });
    }

    // ENCRIPTAR: Hasheamos la contraseña de texto plano (10 pasadas de salto)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

    const newUser = new User({
      username: req.body.username,
      email: req.body.email,
      role: "reader", // Siempre forzar 'reader' para nuevas cuentas
      password: hashedPassword, // ¡Añadimos la contraseña encriptada aquí de forma segura!
    });

    // Cambiamos User.register por el método tradicional de guardado (.save)
    await newUser.save();

    res.redirect("/login");
  } catch (error) {
    if (error.code === 11000) {
      // Error de duplicado de MongoDB (usuario o email)
      const field = Object.keys(error.keyValue)[0];
      return res.render("register", { error: `El ${field} ya está en uso. Por favor, elige otro.` });
    }
    // Otro tipo de error (ej. validación)
    res.render("register", { error: "Error al registrar: " + error.message });
  }
});

// Ruta para mostrar el formulario de login
app.get("/login", function (req, res) {
  res.render("login");
});

// Ruta que procesa el login con mensajes de error
app.post("/login", function (req, res, next) {
  passport.authenticate("local", function (err, user, info) {
    if (err) {
      return next(err);
    }

    // Si el usuario no existe o la contraseña es mala, 'user' será falso.
    // 'info.message' contendrá el texto de error que pusimos arriba.
    if (!user) {
      return res.render("login", { error: info.message });
    }

    // Si todo está bien, iniciamos la sesión
    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }
      return res.redirect("/movies");
    });
  })(req, res, next);
});

// Ruta de logout
app.get("/logout", function (req, res, next) {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// --- RUTAS DE PELÍCULAS (CRUD) ---

// 1. LEER (Mostrar todas las películas) - Lectores, Editores y Superusuarios
app.get("/movies", isLoggedIn, async (req, res) => {
  let query = {};
  // Si existe ?q= en la URL, filtramos por nombre (parecido a Google Search)
  if (req.query.q) {
    query = { Name: { $regex: req.query.q, $options: "i" } };
  }
  const movies = await Movie.find(query);
  res.render("movies", { movies, searchQuery: req.query.q || "" });
});

// 2. CREAR (Formulario) - Solo Editores y Superusuarios
app.get("/movies/new", isEditor, (req, res) => {
  res.render("new-movie");
});

// 2.1 CREAR (Lógica para guardar en BD)
app.post("/movies", isEditor, async (req, res) => {
  try {
    const actorsArray = req.body.Actors ? req.body.Actors.split(",").map((actor) => actor.trim()) : [];
    // Assign req.user._id as owner
    const newMovie = { ...req.body, Actors: actorsArray, owner: req.user._id };
    await Movie.create(newMovie);
    res.redirect("/movies");
  } catch (err) {
    console.log("Error al crear película:", err);
    res.status(400).send(`<h2>Error de validación al crear la película</h2><p>${err.message}</p><a href='/movies/new'>Volver atrás</a>`);
  }
});

// 3. BORRAR - Solo el creador o Superusuarios
app.post("/movies/:id/delete", isEditor, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.redirect("/movies");

    // Autorizar si es superusuario o si es el dueño
    if (req.user.role === "superuser" || (movie.owner && movie.owner.equals(req.user._id))) {
      await Movie.findByIdAndDelete(req.params.id);
    }
    res.redirect("/movies");
  } catch (err) {
    console.log("Error al borrar:", err);
    res.redirect("/movies");
  }
});

// 4. MOSTRAR FORMULARIO DE EDICIÓN (Solo creador o Superusuarios)
app.get("/movies/:id/edit", isEditor, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    // Verificar permisos
    if (req.user.role !== "superuser" && (!movie.owner || !movie.owner.equals(req.user._id))) {
      return res.status(403).send("Acceso denegado: Solo puedes editar tus propias películas.");
    }
    res.render("edit", { movie });
  } catch (err) {
    console.log(err);
    res.redirect("/movies");
  }
});

// 5. ACTUALIZAR PELÍCULA EN LA BD
app.post("/movies/:id/edit", isEditor, async (req, res) => {
  try {
    const checkMovie = await Movie.findById(req.params.id);
    if (req.user.role !== "superuser" && (!checkMovie.owner || !checkMovie.owner.equals(req.user._id))) {
      return res.status(403).send("Acceso denegado: Solo puedes editar tus propias películas.");
    }

    // Convertimos la cadena de actores "Actor 1, Actor 2" en un arreglo de nuevo
    const actorsArray = req.body.Actors ? req.body.Actors.split(",").map((actor) => actor.trim()) : [];
    const updatedMovie = { ...req.body, Actors: actorsArray };

    // runValidators: true es necesario en update para que Mongoose valide las reglas del schema
    await Movie.findByIdAndUpdate(req.params.id, updatedMovie, { runValidators: true });
    res.redirect("/movies");
  } catch (err) {
    console.log("Error al actualizar:", err);
    res.status(400).send(`<h2>Error de validación al editar la película</h2><p>${err.message}</p><a href='/movies/${req.params.id}/edit'>Volver atrás</a>`);
  }
});

let port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", function () {
  console.log("Server Has Started on http://localhost:3000 y está accesible por IP externa");
});
