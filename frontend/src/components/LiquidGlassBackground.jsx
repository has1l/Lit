import React, { useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial, Environment, Float, Sphere } from '@react-three/drei';
import * as THREE from 'three';

function LiquidBlob() {
  const mesh = useRef();

  useFrame((state, delta) => {
    if (mesh.current) {
      mesh.current.rotation.x += delta * 0.15;
      mesh.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={2} floatIntensity={3}>
      <mesh ref={mesh} scale={2.8}>
        <torusKnotGeometry args={[1, 0.4, 256, 64]} />
        <MeshTransmissionMaterial 
          backside={true}
          samples={4}
          thickness={2.5}
          chromaticAberration={0.8}
          anisotropy={0.3}
          distortion={0.5}
          distortionScale={0.5}
          temporalDistortion={0.1}
          ior={1.4}
          color="#a855f7"
          resolution={1024}
          transmission={1}
          roughness={0.1}
        />
      </mesh>
    </Float>
  );
}

export default function LiquidGlassBackground() {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -10, pointerEvents: 'none' }}>
      <Canvas camera={{ position: [0, 0, 8], fov: 45 }} dpr={[1, 2]}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1.5} />
          <pointLight position={[-10, -10, -10]} intensity={2} color="#00A3FF" />
          <pointLight position={[10, -10, 10]} intensity={2} color="#7000FF" />
          
          <LiquidBlob />
          
          <Environment preset="city" />
        </Suspense>
      </Canvas>
    </div>
  );
}
