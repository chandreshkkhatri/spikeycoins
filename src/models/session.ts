import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

export interface IKiteConnectSession {
  access_token: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const kiteConnectSessionSchema = new mongoose.Schema<IKiteConnectSession>(
  {
    access_token: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const KiteConnectSession =
  mongoose.models.KiteConnectSession ||
  mongoose.model<IKiteConnectSession>('KiteConnectSession', kiteConnectSessionSchema);

export const storeSession = async (access_token: string): Promise<void> => {
  try {
    await connectDB();

    // Clear existing sessions
    await KiteConnectSession.deleteMany({});

    // Store new session
    const kiteConnectSession = new KiteConnectSession({ access_token });
    await kiteConnectSession.save();
  } catch (error) {
    console.error('Error storing session to DB:', error);
    throw error;
  }
};

export const retrieveSession = async (): Promise<{
  status: 'success' | 'error';
  session?: IKiteConnectSession;
}> => {
  try {
    await connectDB();

    const doc = await KiteConnectSession.findOne().sort({ createdAt: -1 });

    if (doc) {
      return { status: 'success', session: doc };
    } else {
      return { status: 'error' };
    }
  } catch (error) {
    console.error('Error retrieving session from DB:', error);
    return { status: 'error' };
  }
};

export const clearSession = async (): Promise<void> => {
  try {
    await connectDB();
    await KiteConnectSession.deleteMany({});
  } catch (error) {
    console.error('Error clearing session from DB:', error);
    throw error;
  }
};

export default KiteConnectSession;
