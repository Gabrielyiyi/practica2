// model/User.js
const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

// Definimos el "Esquema" (Schema) para los Usuarios.
// Esto actúa como un molde que asegura que todos los usuarios 
// tengan exactamente la misma estructura antes de guardarse en la base de datos.
const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "El nombre de usuario es obligatorio"],
      unique: true, // Evita duplicados: No pueden existir dos usuarios con el mismo nombre
      trim: true // Borra los espacios en blanco accidentales al inicio y final
    },
    email: {
      type: String,
      required: [true, "El correo electrónico es obligatorio"],
      unique: true, // No pueden existir dos correos iguales registrados
      trim: true,
      // "match" usa una Expresión Regular para validar matemáticamente que el texto tenga formato de correo (@ y .com)
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Por favor, introduce un correo electrónico válido"]
    },
    role: {
      type: String,
      enum: ["reader", "editor", "superuser"], // "enum" restringe los valores: la base de datos SOLO aceptará estas 3 palabras
      default: "editor", // Si al registrarse no le asignamos un rol, automáticamente se le pondrá "editor"
    },
  },
  { collection: "Users" }, // Especificamos exactamente en qué "colección" de MongoDB se guardarán
);

// Agregamos el plugin de Passport, que nos facilita herramientas internas 
// para manejar el inicio de sesión y validaciones de forma automática.
UserSchema.plugin(passportLocalMongoose);

// Exportamos el modelo para poder crear e investigar usuarios desde app.js (User.findOne, etc.)
module.exports = mongoose.model("Users", UserSchema);
