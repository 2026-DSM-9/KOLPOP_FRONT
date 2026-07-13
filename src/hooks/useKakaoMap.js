import { useCallback, useEffect, useRef, useState } from "react";
import {
  getKakaoMapErrorMessage,
  getNoAppKeyMessage,
  loadKakaoMapsSdk,
} from "../lib/kakao.js";

const DEFAULT_MAP_MESSAGE = "카카오맵을 불러오는 중입니다.";
const INIT_ERROR_MESSAGE =
  "카카오맵을 초기화하지 못했습니다. JavaScript 키와 허용 도메인을 확인해 주세요.";

const MAP_CENTER = {
  lat: 37.5352,
  lng: 126.9895,
};

const createLatLng = (kakaoMaps, { lat, lng }) => new kakaoMaps.maps.LatLng(lat, lng);

const createOverlayElement = (listing, onSelect) => {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "map-price-pin";
  element.setAttribute("aria-label", `${listing.title} 지도 핀`);
  element.innerHTML = `
    <span class="map-price-pin__amount">${Math.round(listing.deposit / 10000).toLocaleString("ko-KR")}만 / ${Math.round(listing.price / 10000).toLocaleString("ko-KR")}만</span>
    <span class="map-price-pin__caption">보증 / 일</span>
  `;
  element.addEventListener("click", () => onSelect(listing.id));
  return element;
};

export function useKakaoMap({
  appKey,
  listings,
  activeListingId,
  panelFilter,
  onVisibleIdsChange,
  onSelectListing,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef(new Map());
  const idleHandlerRef = useRef(null);
  const latestRef = useRef({
    listings,
    activeListingId,
    panelFilter,
    onVisibleIdsChange,
    onSelectListing,
  });

  const [mapReady, setMapReady] = useState(false);
  const [mapMessage, setMapMessage] = useState(
    appKey ? DEFAULT_MAP_MESSAGE : getNoAppKeyMessage(),
  );

  latestRef.current = {
    listings,
    activeListingId,
    panelFilter,
    onVisibleIdsChange,
    onSelectListing,
  };

  const syncVisibleIds = () => {
    if (!mapRef.current || !window.kakao?.maps) {
      latestRef.current.onVisibleIdsChange(null);
      return;
    }

    const bounds = mapRef.current.getBounds();
    const nextIds = latestRef.current.listings
      .filter(
        (listing) =>
          latestRef.current.panelFilter(listing) &&
          bounds.contain(createLatLng(window.kakao, listing)),
      )
      .map((listing) => listing.id);

    latestRef.current.onVisibleIdsChange(nextIds);
  };

  const syncOverlays = () => {
    overlaysRef.current.forEach(({ overlay, element }, listingId) => {
      const listing = latestRef.current.listings.find((item) => item.id === listingId);

      if (!listing) {
        overlay.setMap(null);
        return;
      }

      overlay.setVisible(latestRef.current.panelFilter(listing));
      element.classList.toggle("is-active", latestRef.current.activeListingId === listingId);
    });
  };

  const fitMapToListings = useCallback((targetListings) => {
    if (!mapRef.current || !window.kakao?.maps || targetListings.length === 0) {
      return;
    }

    const bounds = new window.kakao.maps.LatLngBounds();

    targetListings.forEach((listing) => {
      bounds.extend(createLatLng(window.kakao, listing));
    });

    mapRef.current.setBounds(bounds, 80, 80, 80, 80);
  }, []);

  const panToListing = useCallback((listingId) => {
    if (!mapRef.current || !window.kakao?.maps) {
      return;
    }

    const listing = latestRef.current.listings.find((item) => item.id === listingId);

    if (!listing) {
      return;
    }

    mapRef.current.panTo(createLatLng(window.kakao, listing));
  }, []);

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    syncOverlays();
    syncVisibleIds();
  }, [mapReady, listings, activeListingId, panelFilter]);

  useEffect(() => {
    if (!appKey) {
      setMapReady(false);
      setMapMessage(getNoAppKeyMessage());
      latestRef.current.onVisibleIdsChange(null);
      return undefined;
    }

    let cancelled = false;
    setMapMessage(DEFAULT_MAP_MESSAGE);

    loadKakaoMapsSdk(appKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current || mapRef.current) {
          return;
        }

        try {
          const map = new kakao.maps.Map(containerRef.current, {
            center: createLatLng(kakao, MAP_CENTER),
            level: 8,
            draggable: true,
            scrollwheel: true,
            keyboardShortcuts: false,
          });

          map.setMinLevel(4);
          map.setMaxLevel(9);

          const zoomControl = new kakao.maps.ZoomControl();
          map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

          latestRef.current.listings.forEach((listing) => {
            const element = createOverlayElement(listing, latestRef.current.onSelectListing);
            const overlay = new kakao.maps.CustomOverlay({
              position: createLatLng(kakao, listing),
              content: element,
              yAnchor: 1,
            });

            overlay.setMap(map);
            overlaysRef.current.set(listing.id, { overlay, element });
          });

          mapRef.current = map;

          idleHandlerRef.current = () => {
            syncVisibleIds();
          };

          kakao.maps.event.addListener(map, "idle", idleHandlerRef.current);

          setMapReady(true);
          setMapMessage("");
          syncOverlays();
          fitMapToListings(latestRef.current.listings.filter(latestRef.current.panelFilter));
        } catch {
          setMapReady(false);
          setMapMessage(INIT_ERROR_MESSAGE);
          latestRef.current.onVisibleIdsChange(null);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setMapReady(false);
        setMapMessage(error.message || getKakaoMapErrorMessage());
        latestRef.current.onVisibleIdsChange(null);
      });

    return () => {
      cancelled = true;

      if (mapRef.current && idleHandlerRef.current && window.kakao?.maps) {
        window.kakao.maps.event.removeListener(mapRef.current, "idle", idleHandlerRef.current);
      }
    };
  }, [appKey]);

  const focusListings = useCallback(
    (targetListings) => {
      fitMapToListings(targetListings);
    },
    [fitMapToListings],
  );

  const resetMapBounds = useCallback(() => {
    focusListings(latestRef.current.listings.filter(latestRef.current.panelFilter));
  }, [focusListings]);

  return {
    mapReady,
    mapMessage,
    mapRef: containerRef,
    focusListings,
    panToListing,
    resetMapBounds,
  };
}
