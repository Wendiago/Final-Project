"use client";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { use, useRef } from "react";
import { cn } from "@/utils/cn";
import { GetTrendingMoviesResponse, TrendingMovies } from "@/types/api";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { paths } from "@/lib/routes";
import MovieOverview from "./movie-overview";
export default function MainCarousel({
  className,
  data,
}: {
  className?: string;
  data: Promise<GetTrendingMoviesResponse>;
}) {
  const movies = use(data).data;
  const router = useRouter();
  const plugin = useRef(Autoplay({ delay: 6000, stopOnInteraction: true }));
  return (
    <Carousel
      opts={{ align: "start", loop: true }}
      plugins={[plugin.current]}
      className={cn(className, "w-full relative")}
    >
      <CarouselPrevious className="h-12 w-12 absolute top-1/2 -translate-y-1/2 left-0 z-10 rounded-none bg-transparent border-none [&_svg]:size-12 hover:bg-transparent [&_svg]:text-white" />
      <CarouselContent>
        {movies.map((movie, index) => (
          <CarouselItem key={index} className="relative">
            <Image
              src={`${process.env.NEXT_PUBLIC_IMDB_IMAGE_URL}/w1280${movie.backdrop_path}`}
              alt="main carousel item"
              width={1440}
              height={850}
              className="w-screen h-[850px] object-cover cursor-pointer"
              onClick={() =>
                router.push(paths.details.getHref(movie.id.toString()))
              }
            />
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/70"></div>
              <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/70"></div>
            </div>
            <MovieOverview data={movie} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselNext className="h-12 w-12 absolute top-1/2 -translate-y-1/2 right-0 z-10 rounded-none bg-transparent border-none [&_svg]:size-12 hover:bg-transparent [&_svg]:text-white" />
    </Carousel>
  );
}
