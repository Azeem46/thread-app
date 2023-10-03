"use server";

import { revalidatePath } from "next/cache";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";

interface Params{
    text: string,
    author: string,
    communityId: string | null,
    path: string,
}

export async function createThread({text, author, communityId, path} : Params){
    try {
          connectToDB();
    const createdThread  = await Thread.create({
        text,
        author,
        community: null,
});

// Update user model
await User.findByIdAndUpdate(author, {
    $push: { threads: createdThread._id}
})

revalidatePath(path);
    } catch (error:any) {
        throw new Error(`Error creating thread: ${error.message}`);
    }
  
}

export async function fetchPosts(pageNumber = 1, pageSize = 20){
    connectToDB();

    // calculate the number of post to be skipped
    const skipAmount = (pageNumber -1) * pageSize;

    // Fetches posts that have no  parents (top-level thread)
    const postsQuery = Thread.find({ parentId: { $in : [null, undefined]}})
    .sort({ createdAt: 'desc' })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({ path: 'author', model: User })
    .populate({
        path: 'children',
        populate: {
            path: 'author',
            model: User,
            select: "_id name parentId image",
        } 
    })

    const totalPostsCount = await Thread.countDocuments({
        parentId: { $in : [null, undefined]},
    });

    const posts = await postsQuery.exec();

    const isNext = totalPostsCount > skipAmount + posts.length;

    return { posts, isNext };
}   

export async function fetchThreadById(id: string) {
    connectToDB();

    try{
        //TODO: populate Community
         const thread = await Thread.findById(id)
      .populate({
        path: "author",
        model: User,
        select: "_id id name image",
      }) 
      .populate({
        path: "children",
        populate: [
          {
            path: "author", 
            model: User,
            select: "_id id name parentId image", 
          },
          {
            path: "children", 
            model: Thread, 
            populate: {
              path: "author", 
              model: User,
              select: "_id id name parentId image", 
            },
          },
        ],
      }).exec();
        return thread;
    }
    catch (error: any ){
        throw new Error(`Error fetching thread: ${error.message}`)
    }
}

export async function addCommentToThread(
  threadId: string,
  commentText: string,
  userId: string,
  path: string,
  ) {
    connectToDB();

    try {
      // Find the original thread by id
      const originalThread = await Thread.findById(threadId);

      if(!originalThread){
        throw new Error("Could not find a thread ");
      }
        //Create a new thread with comment text
        const commentThread = new Thread({
          text: commentText,
          author: userId,
          parentId: threadId,
        })
      // save the new thread

      const saveCommentThread = await commentThread.save();

      // Update the og thread
      originalThread.children.push(saveCommentThread._id);

      //save the original thread
      await originalThread.save();

      revalidatePath(path);
      
    } catch (error: any) {
      throw new Error(`Error adding comment to thread: ${error.message}`)
    }
  }

export async function fetchUserPosts(userId: string) {
  connectToDB();

  //find all threads authorized by user with the given userId
  
  // TODO: Populate community
  try {
    const threads = await User.findOne({ id: userId })
  .populate({
    path:'threads',
    model: Thread,
    populate: {
      path: 'children',
      model: Thread,
      populate: {
        path: 'author',
        model: User,
        select: 'name image id'
      }
    }
  })
  
  return threads;
  
  } catch (error: any) {
     throw new Error(`Failed to fetch user posts: ${error.message}`)
  }
  
  

}