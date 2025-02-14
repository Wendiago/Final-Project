export const paths = {
  home: {
    getHref: () => "/",
  },
  auth: {
    login: {
      getHref: () => "/login",
    },
    register: {
      getHref: () => "/signup",
    },
    verify: {
      getHref: () => "/verify",
    },
  },
  private: {
    getHref: () => "/home",
  },
  search: {
    getHref: (keyword: string) => `/search?keyword=${keyword}`,
  },
  details: {
    getHref: (id: string) => `/movie/${id}`,
  },
  genre: {
    getHref: (id: string) => `/genre/${id}`,
  },
};
