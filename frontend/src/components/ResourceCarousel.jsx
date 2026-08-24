import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getImageUrl } from "../services/api";

export default function ResourceCarousel({ images, title }) {
  const [active, setActive] = useState(0);
  if (!images?.length) return null;

  const goTo = (index) => setActive((index + images.length) % images.length);

  return (
    <div className="resource-carousel" aria-label={`${title} image gallery`}>
      <img src={getImageUrl(images[active])} alt={`${title} — image ${active + 1}`} />
      {images.length > 1 && <>
        <button type="button" className="carousel-control previous" onClick={() => goTo(active - 1)} aria-label="Previous image"><ChevronLeft size={19} /></button>
        <button type="button" className="carousel-control next" onClick={() => goTo(active + 1)} aria-label="Next image"><ChevronRight size={19} /></button>
        <div className="carousel-dots">{images.map((image, index) => <button key={image} type="button" className={index === active ? "active" : ""} onClick={() => goTo(index)} aria-label={`Show image ${index + 1}`} aria-current={index === active} />)}</div>
      </>}
    </div>
  );
}
