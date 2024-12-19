const { Client } = require("@notionhq/client");
const {
    S3Client,
    PutObjectCommand,
    HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const axios = require("axios");
require("dotenv").config();

// Notion API client
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// S3 client configuration
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_TOKEN,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// utility function: generate content hash
async function generateContentHash(imageUrl) {
    const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
    const fileBuffer = Buffer.from(response.data);
    return crypto.createHash("md5").update(fileBuffer).digest("hex");
}

// utility function: check if file exists in S3
async function checkIfFileExistsInS3(bucketName, fileName) {
    try {
        const command = new HeadObjectCommand({ Bucket: bucketName, Key: fileName });
        await s3.send(command);
        return true; // 파일이 존재함
    } catch (err) {
        if (err.name === "NotFound") {
            return false; // 파일이 존재하지 않음
        }
        console.error("Error checking file existence in S3:", err.message);
        throw err;
    }
}

// utility function: upload image to S3
async function uploadImageToS3(imageUrl) {
    try {
        // generate content hash
        const hash = await generateContentHash(imageUrl);
        const fileName = `${hash}.jpg`;

        // check if file exists in S3
        const fileExists = await checkIfFileExistsInS3(process.env.S3_BUCKET_NAME, fileName);
        if (fileExists) {
            const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
            console.log(`File already exists in S3: ${s3Url}`);
            return s3Url; // 기존 파일 URL 반환
        }

        // download image
        const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
        const fileBuffer = Buffer.from(response.data);

        // upload image to S3
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: fileName,
            Body: fileBuffer,
            ContentType: response.headers["content-type"],
        };

        const command = new PutObjectCommand(uploadParams);
        await s3.send(command);

        const s3Url = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
        console.log(`Image uploaded to S3: ${s3Url}`);
        return s3Url;
    } catch (err) {
        console.error("Error uploading image to S3:", err.message);
        throw err;
    }
}

// get page blocks with images
async function getPageBlocksWithImages(pageId) {
    try {
        const response = await notion.blocks.children.list({
            block_id: pageId,
            page_size: 100,
        });

        const blocks = response.results.map(block => ({
            id: block.id,
            type: block.type,
            content: block[block.type]?.text || block[block.type] || null,
            has_children: block.has_children,
        }));

        // extract image URL and upload to S3
        for (const block of response.results) {
            if (block.type === "image") {
                const imageUrl =
                    block.image.type === "file"
                        ? block.image.file.url
                        : block.image.external.url;

                // upload image to S3
                const s3Url = await uploadImageToS3(imageUrl);
                block.image.s3Url = s3Url; // add S3 URL to block data
            }
        }

        return blocks;
    } catch (err) {
        console.error("Error fetching page blocks:", err.message);
        throw err;
    }
}

module.exports = { getPageBlocksWithImages };
