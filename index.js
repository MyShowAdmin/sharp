import express from 'express';
import cors from 'cors';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';

console.log("CLOUDINARY_URL =", process.env.CLOUDINARY_URL);

// ✅ AUTO-CONFIG depuis CLOUDINARY_URL
cloudinary.config();

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: 'sharp-test',
        resource_type: 'image',
        format: 'jpg'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    ).end(buffer);
  });
}

const app = express();

app.use(cors({
  origin: '*', // ou domaine précis plus tard
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '25mb' }));

app.post('/render', async (req, res) => {
  console.log('📥 PAYLOAD REÇU');
  console.log(JSON.stringify(req.body, null, 2));

  try {
    const {
      background,
      userImage,
      crop,
      mask,
      target,
      meta
    } = req.body;

    /* ===========================
       1️⃣ BACKGROUND
       =========================== */

        const bgBuffer = await sharp(
        await fetchImage(background.url)
        )
        .resize(background.width, background.height, {
            fit: 'cover'
        })
        .png()
        .toBuffer();

    /* ===========================
       2️⃣ IMAGE UTILISATEUR
       =========================== */

    const userBuffer = Buffer.from(
      userImage.dataUrl.split(',')[1],
      'base64'
    );

    let userSharp = sharp(userBuffer);

    /* ===========================
       3️⃣ CROP
       =========================== */

    userSharp = userSharp.extract({
      left: crop.x,
      top: crop.y,
      width: crop.width,
      height: crop.height
    });

    /* ===========================
       4️⃣ RESIZE → TARGET
       =========================== */

    userSharp = userSharp.resize(target.width, target.height);

    /* ===========================
       5️⃣ MASQUE
       =========================== */

    if (mask?.type === 'svg') {
      const svgMask = `
        <svg
          width="${target.width}"
          height="${target.height}"
          viewBox="${mask.viewBox}"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="${mask.path}" fill="white"/>
        </svg>
      `;

      userSharp = userSharp.composite([
        {
          input: Buffer.from(svgMask),
          blend: 'dest-in'
        }
      ]);
    }

    /* ===========================
       6️⃣ COMPOSITE FINAL
       =========================== */

    const userFinal = await userSharp.png().toBuffer();

    const finalImage = await sharp(bgBuffer)
      .composite([
        {
          input: userFinal,
          left: target.x,
          top: target.y
        }
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

      console.log('🧪 TEST CLOUDINARY UPLOAD');

      const cloudinaryResult = await uploadToCloudinary(finalImage);

      console.log('✅ CLOUDINARY OK', {
        url: cloudinaryResult.secure_url,
        bytes: cloudinaryResult.bytes
});

    /* ===========================
       LOG FINAL 🔍
       =========================== */

    console.log('✅ RENDU TERMINÉ');
    console.log({
      template: meta.template,
      renderSize: meta.renderSize,
      userImage: {
        original: {
          width: userImage.width,
          height: userImage.height
        },
        crop,
        target
      },
      mask: mask?.type || 'none',
      outputSize: {
        width: background.width,
        height: background.height
      },
      outputBytes: finalImage.length
    });

    /* ===========================
       RESPONSE
       =========================== */

    res.json({
      success: true,
      imageBase64: `data:image/jpeg;base64,${finalImage.toString('base64')}`
    });

  } catch (err) {
    console.error('❌ ERREUR RENDER', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

/* ===========================
   UTILS
   =========================== */

async function fetchImage(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Impossible de charger l’image : ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

app.listen(3000, () => {
  console.log('🚀 Sharp renderer listening on port 3000');
});