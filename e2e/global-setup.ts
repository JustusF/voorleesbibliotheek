import { makeAudio } from './server/make-audio.mjs'

export default function globalSetup() {
  makeAudio()
}
