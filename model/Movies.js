// model/Movie.js
const mongoose = require("mongoose");

const MovieSchema = new mongoose.Schema(
  {
    Name: {
      type: String,
      required: [true, "El nombre de la película es obligatorio"],
      trim: true
    },
    Year: {
      type: Number,
      required: [true, "El año es obligatorio"],
      min: [1800, "El año no puede ser menor a 1800"],
      max: [new Date().getFullYear() + 5, `El año no puede ser mayor a ${new Date().getFullYear() + 5}`]
    },
    Director: {
      type: String,
      required: [true, "El director es obligatorio"],
      trim: true
    },
    Review: {
      type: String,
      required: [true, "La reseña es obligatoria"],
      trim: true
    },
    Actors: {
      type: [String],
      required: [true, "Debe agregar al menos un actor"]
    },
    Image: {
      type: String,
      trim: true
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users"
    }
  },
  { collection: "Movies" },
);

module.exports = mongoose.model("Movies", MovieSchema);
