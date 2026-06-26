const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3001;

const {
  DB_HOST = "db",
  DB_USER = "root",
  DB_PASSWORD = "admin123",
  DB_NAME = "tienda_perritos",
  DB_PORT = 3306,
  CORS_ORIGIN = "*",
} = process.env;

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

let pool;

// Inicializar pool de conexiones
async function initDb() {
  try {
    pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      port: DB_PORT,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    // Verifica que la conexión realmente funcione al iniciar
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log("Pool de conexiones MySQL inicializado y verificado.");
  } catch (err) {
    console.error("Error al inicializar pool de MySQL:", err.message);
  }
}

// Helper para manejar errores
function handleError(res, error, message = "Error interno del servidor") {
  console.error(error);
  res.status(500).json({ message });
}

// Obtener todos los productos
app.get("/api/productos", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, nombre, descripcion, precio, stock FROM productos ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    handleError(res, err, "No se pudieron obtener los productos.");
  }
});

// Obtener un producto por ID
app.get("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      "SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    res.json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo obtener el producto.");
  }
});

// Crear un nuevo producto
app.post("/api/productos", async (req, res) => {
  const { nombre, descripcion, precio, stock } = req.body;

  if (!nombre || precio == null || stock == null) {
    return res.status(400).json({ message: "Nombre, precio y stock son obligatorios." });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO productos (nombre, descripcion, precio, stock) VALUES (?, ?, ?, ?)",
      [nombre, descripcion || null, precio, stock]
    );
    const nuevoId = result.insertId;
    const [rows] = await pool.query(
      "SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?",
      [nuevoId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo crear el producto.");
  }
});

// Actualizar un producto
app.put("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, precio, stock } = req.body;

  if (!nombre || precio == null || stock == null) {
    return res.status(400).json({ message: "Nombre, precio y stock son obligatorios." });
  }

  try {
    const [result] = await pool.query(
      "UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, stock = ? WHERE id = ?",
      [nombre, descripcion || null, precio, stock, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }

    const [rows] = await pool.query(
      "SELECT id, nombre, descripcion, precio, stock FROM productos WHERE id = ?",
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    handleError(res, err, "No se pudo actualizar el producto.");
  }
});

// Eliminar un producto
app.delete("/api/productos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query("DELETE FROM productos WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    res.json({ message: "Producto eliminado correctamente." });
  } catch (err) {
    handleError(res, err, "No se pudo eliminar el producto.");
  }
});

// Endpoint de salud (usado por monitoreo y por el health check de Docker)
app.get("/api/health", async (req, res) => {
  try {
    if (pool) {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
    }
    res.json({ status: "ok", message: "Backend de tienda de perritos en ejecución.", db: "ok" });
  } catch (err) {
    res.status(503).json({ status: "degraded", message: "Backend activo pero sin conexión a BD.", db: "error" });
  }
});

// Iniciar servidor
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Servidor backend escuchando en puerto ${PORT}`);
  await initDb();
});
