import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { v2 as cloudinary } from "cloudinary";
import { APIError } from "../utils/APIError.js";
import { APIResponse } from "../utils/APIResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  uploadPhotoOnCloudinary,
  uploadVideoOnCloudinary,
} from "../utils/cloudinary.js";

const getAllVideos = asyncHandler(async (req, res) => {
  //FIXME: get all videos based on query, sort, pagination
  const {
    page = 1,
    limit = 10,
    query = "",
    sortBy,
    sortType = 1,
    userId,
  } = req.query;

  // console.log(page, limit, sortBy, sortType);

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const stopWords = [
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "he",
    "in",
    "is",
    "it",
    "its",
    "of",
    "on",
    "that",
    "the",
    "to",
    "was",
    "were",
    "will",
    "with",
    "the",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "if",
    "in",
    "into",
    "is",
    "it",
    "no",
    "not",
    "of",
    "on",
    "or",
    "such",
    "that",
    "their",
    "then",
    "there",
    "these",
    "they",
    "this",
    "to",
    "was",
    "will",
    "with",
    "would",
  ];

  const sort = {};
  if (sortBy) {
    sort[sortBy] = parseInt(sortType);
  } else {
    sort.createdAt = -1;
  }

  let filters = { isPublished: true };
  if (isValidObjectId(userId)) filters.owner = userId;

  // filter video by given filters
  // TODO Query is not working
  const pipeline = [
    {
      $match: {
        ...filters,
      },
    },
  ];

  // console.log(query);
  // if query is given filter the videos
  if (query) {
    const words = query.split(" ");
    const filteredWords = words.filter((word) => !stopWords.includes(word));

    pipeline.push(
      {
        $addFields: {
          matchWordCount: {
            $filter: {
              input: filteredWords,
              as: "word",
              cond: { $ne: [{ $indexOfBytes: ["$title", "$$word"] }, -1] },
            },
          },
        },
      },
      {
        $match: {
          matchWordCount: { $ne: [] },
        },
      }
    );
    sort.matchWordCount = -1;
  }

  // sort the documents
  //TODO sorting is not working
  pipeline.push({
    $sort: {
      ...sort,
    },
  });

  //get owner detail
  //TODO Send Owner Field
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $project: {
              _id: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$owner",
    },
    {
      $project: {
        videoFile: 1,
        title: 1,
        description: 1,
        duration: 1,
        thumbnail: 1,
        views: 1,
        owner: 1,
      },
    }
  );

  const allVideos = await Video.aggregate(pipeline);

  // console.log("allvideos: ",allVideos);

  Video.aggregatePaginate(allVideos, options, function (err, results) {
    if (!err) {
      const {
        docs,
        totalDocs,
        limit,
        page,
        totalPages,
        pagingCounter,
        hasPrevPage,
        hasNextPage,
        prevPage,
        nextPage,
      } = results;

      return res.status(200).json(
        new APIResponse(
          200,
          {
            videos: docs,
            totalDocs,
            limit,
            page,
            totalPages,
            pagingCounter,
            hasPrevPage,
            hasNextPage,
            prevPage,
            nextPage,
          },
          "Videos fetched successfully"
        )
      );
    } else throw new APIError(500, err.message);
  });
});

const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  if (!title) {
    throw new APIError(400, "Title is Required");
  }

  let videoFileLocalFilePath = null;
  if (req.files && req.files.videoFile && req.files.videoFile.length > 0) {
    videoFileLocalFilePath = req.files.videoFile[0].path;
  }
  if (!videoFileLocalFilePath) {
    throw new APIError(400, "Video File Must be Required");
  }

  let thumbnailLocalFilePath = null;
  if (req.files && req.files.thumbnail && req.files.thumbnail.length > 0) {
    thumbnailLocalFilePath = req.files.thumbnail[0].path;
  }
  if (!thumbnailLocalFilePath) {
    throw new APIError(400, "Thumbnail File Must be Required");
  }

  const videoFile = await uploadVideoOnCloudinary(videoFileLocalFilePath);
  if (!videoFile) {
    throw new APIError(500, "Error while Uploading Video File");
  }

  const thumbnailFile = await uploadPhotoOnCloudinary(thumbnailLocalFilePath);
  if (!thumbnailFile) {
    throw new APIError(500, "Error while uploadind thumbnail file");
  }

  const video = await Video.create({
    videoFile: videoFile.url,
    title,
    description: description || "",
    duration: videoFile.duration,
    thumbnail: thumbnailFile.url,
    owner: req.user._id,
  });

  if (!video) {
    throw new APIError(500, "Error while Publishing Video");
  }

  return res
    .status(200)
    .json(new APIResponse(200, video, "Video published successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) throw new APIError(400, "Invalid video id");

  const video = await Video.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(videoId),
        isPublished: true,
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
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$owner",
    },
  ]);

  if (!video.length > 0) throw new APIError(400, "No video found");

  return res
    .status(200)
    .json(new APIResponse(200, video[0], "Video sent successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body;

  // Validations
  if (!isValidObjectId(videoId)) throw new APIError(400, "Invalid VideoId...");
  const thumbnailLocalFilePath = req.file?.path;
  if (!title && !description && !thumbnailLocalFilePath) {
    throw new APIError(400, "At-least one field required");
  }

  // check only owner can modify video
  const video = await Video.findById(videoId);
  if (!video) throw new APIError(404, "video not found");

  if (video.owner.toString() !== req.user._id.toString())
    throw new APIError(401, "Only owner can modify video details");

  //Update based on data sent
  let thumbnail;
  if (thumbnailLocalFilePath) {
    thumbnail = await uploadPhotoOnCloudinary(thumbnailLocalFilePath);
    if (!thumbnail)
      throw new APIError(500, "Error accured while uploading photo");

    //TODO Destroy old image
    // const oldImageId = video.thumbnail;
    // const isDestroyed = await cloudinary.uploader.destroy(oldImageId, {
    //   resource_type: "image",
    // });
    // console.log(oldImageId);
    // console.log(isDestroyed);
  }
  if (title) video.title = title;
  if (description) video.description = description;
  if (thumbnail) video.thumbnail = thumbnail.url;

  // Save in database
  const updatedVideo = await video.save({ validateBeforeSave: false });

  if (!updatedVideo) {
    throw new APIError(500, "Error while Updating Details");
  }

  return res
    .status(200)
    .json(new APIResponse(200, updatedVideo, "Video updated successfully"));
});

const deleteVideo = asyncHandler(async (req, res) => {
  // TODO delete files from cloudinary
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new APIError(400, "VideoId not found");

  const findRes = await Video.findByIdAndDelete(videoId);

  if (!findRes) throw new APIError(400, "Video not found");

  return res
    .status(200)
    .json(
      new APIResponse(200, { isDeleted: true }, "Video deleted successfully")
    );
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!videoId) throw new APIError(400, "videoId required");

  const video = await Video.findById(videoId);
  if (!video) throw new APIError(400, "Video not found");

  video.isPublished = !video.isPublished;
  const updatedVideo = await video.save();

  if (!updatedVideo) throw new APIError(400, "Error while toggling");

  return res
    .status(200)
    .json(
      new APIResponse(
        200,
        { isPublished: updatedVideo.isPublished },
        "Video toggled successfully"
      )
    );
});

const updateView = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  if (!isValidObjectId(videoId)) throw new APIError(400, "videoId required");

  const video = await Video.findById(videoId);
  if (!video) throw new APIError(400, "Video not found");

  video.views += 1;
  const updatedVideo = await video.save();
  if (!updatedVideo) throw new APIError(400, "Error occurred on updating view");

  return res
    .status(200)
    .json(
      new APIResponse(
        200,
        { isSuccess: true, views: updatedVideo.views },
        "Video views updated successfully"
      )
    );
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  updateView,
};
