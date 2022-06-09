import { pipeline, Readable, Transform } from 'stream'
import { promisify } from 'util'
import { dirname } from 'path'
import { createWriteStream } from 'fs'

import EPub from 'epub'
import * as cheerio from 'cheerio'

const { pathname: currentFile } = new URL(import.meta.url)
const cwd = dirname(currentFile)

const epubFilePath = `${cwd}/dataset/novo_cantico.epub`

const epub = new EPub(epubFilePath)

const pipelineAsync = promisify(pipeline)

const getChapterIds = new Readable({
  read () {
    epub.on('end', () => {
      for (const chapter of epub.flow) {
        this.push(chapter.id)
      }

      this.push(null)
    })

    epub.parse()
  }
})

const getHTMLFromChapters = new Transform({
  transform (chapterId, encoding, next) {
    epub.getChapter(chapterId, next)
  }
})

const formatHTML = new Transform({
  transform (chapterBuffer, encoding, next) {
    const $ = cheerio.load(chapterBuffer.toString())

    const headingIds = $('h3').map(function () {
      return '#' + $(this).attr('id')
    })

    for (const headingId of headingIds) {
      const content = $(headingId).nextUntil('h3')
      const title = `HNC ${$(headingId).text()}`

      const htmlMarckup = $.html(content).split('\n')
        .filter(Boolean)
        .map(line => line.trim())
        .join('\n')

      const formatedContent = $(htmlMarckup).text().trim().split('\n')
        .filter((line, index, self) => line || (!line && self[index + 1])).join('\n')

      this.push(JSON.stringify({
        title,
        content: formatedContent
      }))
    }

    next()
  }
})

const setContent = new Transform({
  transform (chunk, encoding, next) {
    const { title, content } = JSON.parse(chunk)

    next(null, `${title}\n\n${content}\n\n\n`)
  }
})

await pipelineAsync(
  getChapterIds,
  getHTMLFromChapters,
  formatHTML,
  setContent,
  createWriteStream('hymns.txt')
)
