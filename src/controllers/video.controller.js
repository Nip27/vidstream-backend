import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"

// ─────────────────────────────────────────────
// GET ALL VIDEOS
// ─────────────────────────────────────────────
const getAllVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query

  const pipeline = []

  // search using $regex — works without Atlas Search index
  if (query) {
    pipeline.push({
      $match: {
        $or: [
          { title: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
        ],
      },
    })
  }

  // filter by userId if provided
  if (userId) {
    if (!isValidObjectId(userId)) {
      throw new ApiError(400, "Invalid userId")
    }
    pipeline.push({
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
      },
    })
  }

  // only published videos
  pipeline.push({ $match: { isPublished: true } })

  // sort — title matches first when searching
  if (query) {
    pipeline.push({
      $addFields: {
        titleMatch: {
          $indexOfCP: [
            { $toLower: "$title" },
            query.toLowerCase(),
          ],
        },
      },
    })
    pipeline.push({
      $sort: { titleMatch: 1, createdAt: -1 },
    })
  } else if (sortBy && sortType) {
    pipeline.push({
      $sort: {
        [sortBy]: sortType === "asc" ? 1 : -1,
      },
    })
  } else {
    pipeline.push({ $sort: { createdAt: -1 } })
  }

  // join owner details
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "ownerDetails",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$ownerDetails",
    }
  )

  const videoAggregate = Video.aggregate(pipeline)

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  }

  const video = await Video.aggregatePaginate(videoAggregate, options)

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Videos fetched successfully"))
})

// ─────────────────────────────────────────────
// PUBLISH A VIDEO (file upload)
// ─────────────────────────────────────────────
const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body

  if ([title, description].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required")
  }

  const videoFileLocalPath = req.files?.videoFile[0].path
  const thumbnailLocalPath = req.files?.thumbnail[0].path

  if (!videoFileLocalPath) {
    throw new ApiError(400, "videoFile is required")
  }

  if (!thumbnailLocalPath) {
    throw new ApiError(400, "thumbnail is required")
  }

  const videoFile = await uploadOnCloudinary(videoFileLocalPath)
  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

  if (!videoFile) {
    throw new ApiError(400, "Video file upload failed")
  }

  if (!thumbnail) {
    throw new ApiError(400, "Thumbnail upload failed")
  }

  const video = await Video.create({
    videoFile: videoFile.url,
    thumbnail: thumbnail.url,
    title,
    description,
    duration: videoFile.duration,
    owner: req.user?._id,
    isPublished: true,
  })

  const videoUploaded = await Video.findById(video._id)

  if (!videoUploaded) {
    throw new ApiError(500, "videoUpload failed please try again !!!")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, videoUploaded, "Video uploaded successfully"))
})

// ─────────────────────────────────────────────
// PUBLISH VIDEO FROM URL
// ─────────────────────────────────────────────
const publishVideoFromUrl = asyncHandler(async (req, res) => {
  const { title, description, videoUrl, duration } = req.body

  if (!title || !videoUrl) {
    throw new ApiError(400, "Title and video URL are required")
  }

  let thumbnailUrl = `https://picsum.photos/seed/${Date.now()}/640/360`
  const thumbnailLocalPath = req.file?.path

  if (thumbnailLocalPath) {
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    if (thumbnail) thumbnailUrl = thumbnail.url
  }

  const video = await Video.create({
    videoFile: videoUrl,
    thumbnail: thumbnailUrl,
    title,
    description: description || "",
    duration: parseInt(duration) || 0,
    owner: req.user?._id,
    isPublished: true,
  })

  const videoCreated = await Video.findById(video._id)

  if (!videoCreated) {
    throw new ApiError(500, "Failed to add video")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, videoCreated, "Video added successfully"))
})

// ─────────────────────────────────────────────
// GET VIDEO BY ID
// ─────────────────────────────────────────────
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId")
  }

  if (!isValidObjectId(req.user?._id)) {
    throw new ApiError(400, "Invalid userId")
  }

  const video = await Video.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(videoId),
      },
    },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "subscribers",
            },
          },
          {
            $addFields: {
              subscribersCount: { $size: "$subscribers" },
              isSubscribed: {
                $cond: {
                  if: { $in: [req.user?._id, "$subscribers.subscriber"] },
                  then: true,
                  else: false,
                },
              },
            },
          },
          {
            $project: {
              username: 1,
              avatar: 1,
              subscribersCount: 1,
              isSubscribed: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        likesCount: { $size: "$likes" },
        owner: { $first: "$owner" },
        isLiked: {
          $cond: {
            if: { $in: [req.user?._id, "$likes.likedBy"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        videoFile: 1,
        title: 1,
        description: 1,
        views: 1,
        createdAt: 1,
        duration: 1,
        comments: 1,
        owner: 1,
        likesCount: 1,
        isLiked: 1,
        thumbnail: 1,
        isPublished: 1,
      },
    },
  ])

  if (!video) {
    throw new ApiError(500, "failed to fetch video")
  }

  await Video.findByIdAndUpdate(videoId, {
    $inc: { views: 1 },
  })

  await User.findByIdAndUpdate(req.user?._id, {
    $addToSet: { watchHistory: videoId },
  })

  return res
    .status(200)
    .json(new ApiResponse(200, video[0], "video details fetched successfully"))
})

// ─────────────────────────────────────────────
// UPDATE VIDEO
// ─────────────────────────────────────────────
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params
  const { title, description } = req.body

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId")
  }

  if (!(title && description)) {
    throw new ApiError(400, "title and description are required")
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "No video found")
  }

  if (video?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "You can't edit this video as you are not the owner")
  }

  const thumbnailLocalPath = req.file?.path

  if (!thumbnailLocalPath) {
    throw new ApiError(400, "thumbnail is required")
  }

  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

  if (!thumbnail) {
    throw new ApiError(400, "thumbnail not found")
  }

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        title,
        description,
        thumbnail: thumbnail.url,
      },
    },
    { new: true }
  )

  if (!updatedVideo) {
    throw new ApiError(500, "Failed to update video please try again")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedVideo, "Video updated successfully"))
})

// ─────────────────────────────────────────────
// DELETE VIDEO
// ─────────────────────────────────────────────
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId")
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "No video found")
  }

  if (video?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "You can't delete this video as you are not the owner")
  }

  await Video.findByIdAndDelete(video?._id)

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Video deleted successfully"))
})

// ─────────────────────────────────────────────
// TOGGLE PUBLISH STATUS
// ─────────────────────────────────────────────
const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId")
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  if (video?.owner.toString() !== req.user?._id.toString()) {
    throw new ApiError(400, "You can't toggle publish status as you are not the owner")
  }

  const toggledVideoPublish = await Video.findByIdAndUpdate(
    videoId,
    {
      $set: {
        isPublished: !video?.isPublished,
      },
    },
    { new: true }
  )

  if (!toggledVideoPublish) {
    throw new ApiError(500, "Failed to toggle video publish status")
  }

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { isPublished: toggledVideoPublish.isPublished },
        "Video publish toggled successfully"
      )
    )
})

export {
  getAllVideos,
  publishAVideo,
  publishVideoFromUrl,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
}