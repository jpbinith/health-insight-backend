import { Db, MongoClient, ServerApiVersion } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export const connectToDatabase = async (): Promise<Db> => {
  if (cachedClient && cachedDb) {
    return cachedDb;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  const dbName = process.env.MONGODB_DB ?? 'health-insight';

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  await client.connect();
  await client.db(dbName).command({ ping: 1 });
  // eslint-disable-next-line no-console -- log successful connection once on startup
  console.log(`MongoDB connection established to database "${dbName}"`);

  cachedClient = client;
  cachedDb = client.db(dbName);

  return cachedDb;
};

export const getDatabase = (): Db => {
  if (!cachedDb) {
    throw new Error(
      'Database connection has not been established. Call connectToDatabase() first.',
    );
  }

  return cachedDb;
};

export const getMongoClient = (): MongoClient => {
  if (!cachedClient) {
    throw new Error(
      'MongoClient connection has not been established. Call connectToDatabase() first.',
    );
  }

  return cachedClient;
};

export const disconnectFromDatabase = async (): Promise<void> => {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
};
