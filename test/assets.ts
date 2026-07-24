// None of these are fetched in tests — every request goes through a mock `fetch`
export const ASSETS = {
  image: "https://jigsawstack.com/preview/vocr-example.jpg",
  gif: "https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif",
  svg: "https://upload.wikimedia.org/wikipedia/commons/8/84/Example.svg",
  audio: "https://jigsawstack.com/preview/stt-example.wav",
  csv: "https://r2public.jigsawstack.com/interfaze/examples/prediction-example.csv",
  scene: "https://raw.githubusercontent.com/ultralytics/yolov5/master/data/images/bus.jpg",
  gui: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1024",
  pdf: "https://arxiv.org/pdf/1706.03762",
  scrape: "https://news.ycombinator.com",
  video: "https://download.samplelib.com/mp4/sample-5s.mp4",
} as const;
