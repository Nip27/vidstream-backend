import { v2 as cloudinary } from "cloudinary"
import fs from "fs"

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null

    console.log("☁️  Uploading to Cloudinary:", localFilePath)
    console.log("☁️  Cloud name:", process.env.CLOUDINARY_CLOUD_NAME)

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    })

    console.log("✅ Cloudinary upload success:", response.secure_url)
    fs.unlinkSync(localFilePath)
    return response

  } catch (error) {
    console.log("❌ CLOUDINARY ERROR:", error.message)
    console.log("❌ Full error:", error)
    // try to delete the local file
    try { fs.unlinkSync(localFilePath) } catch {}
    return null
  }
}

export { uploadOnCloudinary }