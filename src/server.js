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

// Crea la base de datos (si no existe), la tabla y los datos de ejemplo.
// Se ejecuta una sola vez al arrancar el servidor.
async function ejecutarScriptInit() {
  let conexionInicial;
  try {
    conexionInicial = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      port: DB_PORT,
    });

    console.log("=== Asegurando base de datos y tablas ===");

    await conexionInicial.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME};`);
    await conexionInicial.query(`USE ${DB_NAME};`);

    await conexionInicial.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        descripcion TEXT,
        precio DECIMAL(10,2) NOT NULL,
        stock INT NOT NULL
      );
    `);

    const [rows] = await conexionInicial.query("SELECT COUNT(*) as total FROM productos;");
    if (rows[0].total === 0) {
      await conexionInicial.query(`
        INSERT INTO productos (nombre, descripcion, precio, stock) VALUES
        ('Alimento Cachorro Premium', 'Sabor pollo para cachorros', 19990, 15),
        ('Alimento Adulto Light', 'Ideal para perritos con sobrepeso', 24990, 10),
        ('Snacks Dentales', 'Cuidado sarro pack de 4 unidades', 4990, 50);
      `);
      console.log("=== Productos iniciales insertados con éxito ===");
    }

    console.log("=== Base de datos verificada y lista ===");
  } catch (err) {
    console.error("Error en inicialización de la base de datos:", err.message);
  } finally {
    if (conexionInicial) await conexionInicial.end();
  }
}

// Inicializar pool de conexiones para uso normal de la API
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

    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log("Pool de conexiones MySQL inicializado y verificado.");
  } catch (err) {
    console.error("Error al inicializar pool de MySQL:", err.message);
  }
}

function handleError(res, error, message = "Error interno del servidor") {
  console.error(error);
  res.status(500).json({ message });
}

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

// Iniciar servidor: primero asegura la base de datos, luego abre el pool de la API
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Servidor backend escuchando en puerto ${PORT}`);
  await ejecutarScriptInit();
  await initDb();
});
