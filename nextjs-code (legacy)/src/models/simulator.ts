import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

export interface ISimulationData {
  instrument_token: string;
  interval: string;
  date: string;
  candleStickData: any[];
  createdAt?: Date;
  updatedAt?: Date;
}

const simulationDataSchema = new mongoose.Schema<ISimulationData>(
  {
    instrument_token: {
      type: String,
      required: true,
    },
    interval: {
      type: String,
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    candleStickData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add compound index
simulationDataSchema.index({ instrument_token: 1, interval: 1, date: 1 });

const SimulationData =
  mongoose.models.SimulationData ||
  mongoose.model<ISimulationData>('SimulationData', simulationDataSchema);

export const storeSimulationData = async (
  instrument_token: string,
  interval: string,
  date: string,
  candleStickData: any[]
): Promise<void> => {
  try {
    await connectDB();

    const simulationData = new SimulationData({
      instrument_token,
      interval,
      date,
      candleStickData,
    });

    await simulationData.save();
  } catch (error) {
    console.error('Error saving simulation data:', error);
    throw error;
  }
};

export const getSimulationData = async (
  instrument_token: string,
  interval: string,
  date: string
): Promise<{
  status: boolean;
  doc?: ISimulationData;
}> => {
  try {
    await connectDB();

    const doc = await SimulationData.findOne({
      instrument_token,
      interval,
      date,
    });

    if (doc) {
      return { status: true, doc };
    } else {
      return { status: false };
    }
  } catch (error) {
    console.error('Error fetching simulation data:', error);
    return { status: false };
  }
};

export const flushSimulationData = async (): Promise<void> => {
  try {
    await connectDB();
    await SimulationData.deleteMany({});
  } catch (error) {
    console.error('Error flushing simulation data:', error);
    throw error;
  }
};

export default SimulationData;
