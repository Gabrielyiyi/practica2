// model/User.js
const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "El nombre de usuario es obligatorio"],
      unique: true,
      trim: true
    },
    email: {
      type: String,
      required: [true, "El correo electrónico es obligatorio"],
      unique: true,
      trim: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Por favor, introduce un correo electrónico válido"]
    },
    password: {
      type: String,
      required: [true, "La contraseña es obligatoria"]
    },
    role: {
      type: String,
      enum: ["reader", "editor", "superuser"],
      default: "reader",
    },
  },
  { collection: "Users" },
);

UserSchema.plugin(passportLocalMongoose);
module.exports = mongoose.model("Users", UserSchema);
