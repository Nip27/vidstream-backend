import { Router } from "express"
import {
  deleteVideo,
  getAllVideos,
  getVideoById,
  publishAVideo,
  publishVideoFromUrl,
  togglePublishStatus,
  updateVideo,
} from "../controllers/video.controller.js"
import { verifyJWT } from "../middlewares/auth.middleware.js"
import { upload } from "../middlewares/multer.middleware.js"

const router = Router()

router.use(verifyJWT)

router
  .route("/")
  .get(getAllVideos)
  .post(
    upload.fields([
      { name: "videoFile", maxCount: 1 },
      { name: "thumbnail", maxCount: 1 },
    ]),
    publishAVideo
  )

// must be before /:videoId
router
  .route("/url")
  .post(upload.single("thumbnail"), publishVideoFromUrl)

router
  .route("/:videoId")
  .get(getVideoById)
  .delete(deleteVideo)
  .patch(upload.single("thumbnail"), updateVideo)

router.route("/toggle/publish/:videoId").patch(togglePublishStatus)

export default router