// model/Movies.js
const mongoose = require("mongoose");

// Molde/Plantilla para los documentos de Películas.
// Obliga a que cualquier película que intentemos guardar cumpla con estas reglas.
const MovieSchema = new mongoose.Schema(
  {
    Name: {
      type: String,
      required: [true, "El nombre de la película es obligatorio"],
      trim: true // Evita que se guarden nombres con espacios extra al inicio/fin (ej. "   Batman   ")
    },
    Year: {
      type: Number,
      required: [true, "El año es obligatorio"],
      // Validaciones lógicas: no permitimos películas de antes de 1800 ni de un futuro muy lejano
      min: [1800, "El año no puede ser menor a 1800"],
      max: [new Date().getFullYear() + 5, `El año no puede ser mayor a ${new Date().getFullYear() + 5}`]
    },
    Director: {
      type: String,
      required: [true, "El director es obligatorio"],
      trim: true
    },
    Review: {
      type: String, // Texto largo con la opinión o sinopsis
      required: [true, "La reseña es obligatoria"],
      trim: true
    },
    Actors: {
      type: [String], // Es un Arreglo de Textos (ej. ["Brad Pitt", "Morgan Freeman"])
      required: [true, "Debe agregar al menos un actor"]
    },
    Image: {
      type: String, // Aquí guardaremos una URL (enlace) a la imagen de la portada
      trim: true
    },
    owner: {
      // ESTO ES CLAVE: Guarda el ID único del Usuario que creó esta película.
      // Actúa como una "Llave Foránea" (Foreign Key). 
      // Nos permite saber de quién es la película y evitar que otros la borren o editen.
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users" // Hace referencia al esquema de "Users"
    }
  },
  { collection: "Movies" }, // Guarda estos documentos en la colección de MongoDB llamada "Movies"
);

// Exportamos el modelo para poder usarlo en app.js (ej. Movie.find(), Movie.create(), etc.)
module.exports = mongoose.model("Movies", MovieSchema);
