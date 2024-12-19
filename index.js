const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { getPageBlocksWithImages, appendPageBlock } = require("./services/notion");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// get page blocks with images
app.get("/page/:id/blocks", async (req, res) => {
    const { id: pageId } = req.params;
    try {
        const blocks = await getPageBlocksWithImages(pageId);
        res.json(blocks);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching page blocks or downloading images");
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
