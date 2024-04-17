import { isValidObjectId } from "mongoose";
import { Comment } from "../models/comment.model.js";
import { APIError } from "../utils/APIError.js";
import { APIResponse } from "../utils/APIResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  if (!isValidObjectId(videoId)) throw new APIError(400, "Invalid VideoId");

  let comments;

  const options = {
    page,
    limit,
  };

  const allComment = await Comment.aggregate([
    {
      $match: {
        video: videoId,
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
              fullName: 1,
              username: 1,
              avatar: 1,
              _id: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$owner",
    },
  ]);


  Comment.aggregatePaginate(allComment, options, function (err, results) {
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
            Comments: docs,
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
          "Comments fetched successfully"
        )
      )
    } else throw new APIError(500, err.message);
  });
});

const addComment = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { content } = req.body;
  if (!isValidObjectId(videoId)) throw new APIError(400, "Invalid VideoId");
  if (!content) throw new APIError(400, "No Comment Found");

  const comment = await Comment.create({
    content,
    video: videoId,
    owner: req.user._id,
  });
  if (!comment) throw new APIError(500, "Error while adding comment");

  return res
    .status(200)
    .json(new APIResponse(200, comment, "Comment added successfully"));
});

const updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;
  if (!isValidObjectId(commentId)) throw new APIError(400, "Invalid VideoId");
  if (!content) throw new APIError(400, "No Comment Found");
  const newComment = await Comment.findByIdAndUpdate(
    commentId,
    {
      $set: {
        content,
      },
    },
    {
      new: true,
    }
  );
  if (!newComment) throw new APIError(500, "Error while editing comment");
  return res
    .status(200)
    .json(new APIResponse(200, newComment, "Comment updated successfully"));
});

const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  if (!isValidObjectId(commentId)) throw new APIError(400, "Invalid VideoId");

  const comment = await Comment.findByIdAndDelete(commentId);

  if (!comment) throw new APIError(500, "Error while deleting comment");

  return res
    .status(200)
    .json(
      new APIResponse(200, { isDeleted: true }, "Comment deleted successfully")
    );
});

export { getVideoComments, addComment, updateComment, deleteComment };
