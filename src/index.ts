import express, { type Request, type Response } from 'express';
import path from 'path'
import { fileURLToPath } from 'url';
import { db_connection, db_query } from './db/index.js';
import { fill_database } from './db/commands.js';

const app = express();
const PORT = 8080;

const __filename__ = fileURLToPath(import.meta.url)
const __dirname__ = path.dirname(__filename__)

app.use(express.json());
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname__, 'views'))

app.get('/', (req: Request, res: Response) => {
    res.redirect('/app')
});

app.get('/app', async (req: Request, res: Response) => {
    res.render('homepage')
})

//* 1. SQL Umetanje, tautologija

app.post('/orders', async (req: Request, res: Response) => {
  const { email = '', password = '', vulnerable = false } = req.body ?? {};

  try {
    let result;
    let query: string;

    if (vulnerable) {
        //* Nesigurna pretraga, bez parametrizacije upita
        query = `SELECT id, email, full_name, password FROM customers WHERE email = '${email}' AND password = '${password}'`;
        result = await db_query(query);
    } else {
        //* Sigurna pretraga s parametrizacijom 
        query = 'SELECT id, email, full_name FROM customers WHERE email = $1 AND password = $2';
        result = await db_query(query, [email, password]);
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ query, error: 'Pogrešan email ili lozinka.' });
    }

    const customerIds = result.rows.map((result) => result.id);
    const ordersResult = await db_query(
      `SELECT customer_id, item, total FROM orders WHERE customer_id = ANY($1)`,
      [customerIds]
    );

    return res.json({ query, customers: result.rows, orders: ordersResult.rows });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

//* 2. Loša autentifikacija, brute force napad

const loginAttempts = new Map<string, number>();
const MAX_ATTEMPTS = 3;

app.post('/login', async (req: Request, res: Response) => {
  const { email = '', password = '', vulnerable = false } = req.body ?? {};

  //* Ograničavanje broja pristupa
  if (!vulnerable) {
    const attempts = loginAttempts.get(email) ?? 0;
    if (attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ message: 'Previše neuspješnih pokušaja. Pokušajte ponovno za 5 sekundi.', success: false });
    }
  }

  const userResult = await db_query('SELECT id, full_name, password FROM customers WHERE email = $1', [email]);

  if (userResult.rows.length === 0) {
    if (!vulnerable) {
      loginAttempts.set(email, (loginAttempts.get(email) ?? 0) + 1);
    }
    return res.status(401).json({

      //* Različit prikaz poruke ovisno je li uključena ranjivost
      message: vulnerable ? 'Email ne postoji.' : 'Pogrešni podaci za prijavu.',
      success: false,
    });
  }

  const user = userResult.rows[0];

  if (user.password !== password) {
    if (!vulnerable) {
      loginAttempts.set(email, (loginAttempts.get(email) ?? 0) + 1);
    }
    return res.status(401).json({

      //* Različit prikaz poruke ovisno je li uključena ranjivost
      message: vulnerable ? 'Pogrešna lozinka.' : 'Pogrešni podaci za prijavu.',
      success: false,
    });
  }

  loginAttempts.delete(email);
  return res.json({ message: `Prijava uspješna kao ${user.full_name}.`, success: true });
});

app.listen(PORT, () => {
    console.log(`Server pokrenut na adresi http://localhost:${PORT}`);
})



