import * as faceapi from 'face-api.js';
import { getFaceDescriptors } from '../store/storage';

let modelsLoaded = false;
let loadingPromise: Promise<void> | null = null;

const APP_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
const MODEL_URL = `${APP_BASE_PATH}/models`;

export async function loadModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      console.log('Face-api models loaded successfully');
    } catch (error) {
      console.error('Failed to load face-api models:', error);
      loadingPromise = null;
      throw error;
    }
  })();

  return loadingPromise;
}

export function isModelsLoaded(): boolean {
  return modelsLoaded;
}

export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>> | null> {
  if (!modelsLoaded) await loadModels();

  const detection = await faceapi
    .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  return detection || null;
}

export async function getFaceDescriptor(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<Float32Array | null> {
  const detection = await detectFace(input);
  return detection ? detection.descriptor : null;
}

export function compareFaces(
  descriptor1: Float32Array,
  descriptor2: Float32Array,
  threshold: number = 0.5
): { match: boolean; distance: number } {
  const distance = faceapi.euclideanDistance(
    Array.from(descriptor1),
    Array.from(descriptor2)
  );
  return {
    match: distance < threshold,
    distance,
  };
}

export interface RecognitionResult {
  employeeId: string;
  distance: number;
  confidence: number;
}

export async function recognizeFace(
  descriptor: Float32Array,
  threshold: number = 0.5
): Promise<RecognitionResult | null> {
  const storedDescriptors = await getFaceDescriptors();
  let bestMatch: RecognitionResult | null = null;

  storedDescriptors.forEach((storedDescriptor, employeeId) => {
    const { distance } = compareFaces(descriptor, storedDescriptor, threshold);
    if (distance < threshold) {
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = {
          employeeId,
          distance,
          confidence: Math.round((1 - distance) * 100),
        };
      }
    }
  });

  return bestMatch;
}

export function captureSnapshot(video: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.8);
}

export { faceapi };
