import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import ballImage from "../../utils/Dneprovec.png";

const ThreeDBall = () => {
  const containerRef = useRef(null);
  const ballRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Создание сцены
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0a0a0a);

    // Создание камеры
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1, 8); // Немного подняли камеру
    cameraRef.current = camera;

    // Создание рендерера
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // === ОСВЕЩЕНИЕ ===
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    // Основной свет
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 2);
    scene.add(directionalLight);

    // Подсветка снизу
    const bottomLight = new THREE.PointLight(0x4169e1, 0.5);
    bottomLight.position.set(0, -3, 2);
    scene.add(bottomLight);

    // === СОЗДАНИЕ ТЕКСТУРЫ С УМЕНЬШЕННЫМ РАЗМЕРОМ ===
    const textureLoader = new THREE.TextureLoader();

    // Создаем canvas для уменьшения изображения
    const createReducedTexture = (image) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Уменьшаем размер изображения (делаем его меньше на мяче)
      canvas.width = 512;
      canvas.height = 512;

      // Рисуем изображение по центру canvas с отступами
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Рассчитываем размер изображения (70% от размера canvas)
      const imgSize = canvas.width * 0.7;
      const offset = (canvas.width - imgSize) / 2;

      // Рисуем изображение с отступами от краев
      ctx.drawImage(image, offset, offset, imgSize, imgSize);

      return new THREE.CanvasTexture(canvas);
    };

    // Загружаем изображение и создаем уменьшенную текстуру
    const img = new Image();
    img.onload = () => {
      const texture = createReducedTexture(img);

      // Настройка текстуры
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;

      // Обновляем материал мяча с новой текстурой
      if (ballRef.current) {
        ballRef.current.material.map = texture;
        ballRef.current.material.needsUpdate = true;
      }
    };
    img.src = ballImage;

    // Временная текстура на время загрузки
    const tempTexture = textureLoader.load(ballImage);

    // === СОЗДАНИЕ МЯЧА ===
    const geometry = new THREE.SphereGeometry(2.5, 64, 64);

    const material = new THREE.MeshStandardMaterial({
      map: tempTexture,
      roughness: 0.3,
      metalness: 0.1,
      emissive: new THREE.Color(0x111111),
      emissiveIntensity: 0.2,
    });

    const ball = new THREE.Mesh(geometry, material);
    ball.castShadow = false;
    ball.receiveShadow = false;

    // Начальный поворот
    ball.rotation.x = 1.5; // Поворачиваем, чтобы текст был виден
    ball.rotation.y = 0.5;
    ball.rotation.z = 0;

    scene.add(ball);
    ballRef.current = ball;

    // Добавляем свечение
    const glowGeometry = new THREE.SphereGeometry(2.6, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x4169e1,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    ball.add(glow);

    // === ЧАСТИЦЫ ===
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 300;
    const posArray = new Float32Array(particlesCount * 3);

    for (let i = 0; i < particlesCount; i++) {
      const radius = 4 + Math.random() * 1.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      posArray[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      posArray[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      posArray[i * 3 + 2] = radius * Math.cos(phi);
    }

    particlesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posArray, 3)
    );

    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.05,
      color: 0xd4a574,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    let frameId;
    const animate = () => {
      if (ballRef.current) {
        // Вращаем мяч ТОЛЬКО по оси X (вокруг горизонтальной оси)
        ballRef.current.rotation.x += 0.008; // Только X меняется
        // rotation.y и rotation.z остаются неизменными

        // Легкое покачивание
        ballRef.current.position.y = Math.sin(Date.now() * 0.001) * 0.1;
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    animate();

    // Обработка ресайза
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    // Очистка
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameId);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return <div ref={containerRef} className="ball-container" />;
};

export default ThreeDBall;
