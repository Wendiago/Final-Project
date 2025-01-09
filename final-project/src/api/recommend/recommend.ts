import { customFetch } from "@/lib/api-client";
import { GetMovieTrailersResponse } from "@/types/api";

import { useQuery } from "@tanstack/react-query";

// Get recommendation based on favorite list
export const getRecommendationBasedFavoriteList = async ({
  genres,
  rating,
  release_year,
  page = 1,
  limit = 20,
}: {
  genres?: string;
  rating?: string;
  release_year?: string;
  page?: number;
  limit?: number;
}): Promise<any> => {
  const response = await customFetch.get("/api/v1/recommend/movie ", {
    params: { genres, rating, release_year, page, limit },
  });
  return response;
};

export const useRecommendationBasedFavoriteList = ({
  genres,
  rating,
  release_year,
  page = 1,
  limit = 20,
}: {
  genres?: string;
  rating?: string;
  release_year?: string;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: [
      "getRecommendationBasedFavoriteList",
      genres,
      rating,
      release_year,
      page,
      limit,
    ],
    queryFn: () =>
      getRecommendationBasedFavoriteList({
        genres,
        rating,
        release_year,
        page,
        limit,
      }),
  });
};

// Set latest trailer list
export const setLatestTrailerList = async (): Promise<any> => {
  const response = await customFetch.get("/api/v1/movie/upcoming/set");
  return response;
};

export const useSetLatestTrailerList = () => {
  return useQuery({
    queryKey: ["setLatestTrailerList"],
    queryFn: () => setLatestTrailerList(),
  });
};

// Get latest trailer list
export const getLatestTrailerList =
  async (): Promise<GetMovieTrailersResponse> => {
    const response = await customFetch.get<GetMovieTrailersResponse>(
      "/api/v1/movie/upcoming"
    );
    return response;
  };

export const useLatestTrailerList = () => {
  return useQuery({
    queryKey: ["getLatestTrailerList"],
    queryFn: () => getLatestTrailerList(),
  });
};
