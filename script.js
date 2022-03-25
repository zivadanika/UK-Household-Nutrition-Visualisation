const COLOR_SCHEME = ["#1f77b4", "#ff7f0e"];

d3.csv("https://docs.google.com/spreadsheets/d/e/2PACX-1vRrIczteAx_TRc-MH_b7LsnAExus3dJ8Nq2NiJW98UuabdrUI5xHIJXSa2NsCD7s3ELycgNJBQ9k7zj/pub?output=csv").then((csv) => {
  const { data, years, nutrientTypes, regions } = processData(csv);

  // Initial filter values
  const filters = {
    nutrientType: nutrientTypes[0],
    regions: [regions[0]],
  };
  let filteredData = filterData(data, filters);

  // Filter change event handler
  function handleFilterChange(event) {
    const { key, value } = event.detail;
    filters[key] = value;
    filteredData = filterData(data, filters);
    chart.updateData(filteredData);
  }

  // Nutrient type control
  const nutrientTypeContainer = d3
    .select("#nutrientTypeControl")
    .on("filterchange", handleFilterChange);

  renderNutrientTypeControl(
    nutrientTypeContainer,
    nutrientTypes,
    filters.nutrientType
  );

  // Regions control
  const regionsContainer = d3
    .select("#regionsControl")
    .on("filterchange", handleFilterChange);

  renderRegionsControl(regionsContainer, regions, filters.regions);

  // Multiline trend chart
  const chartContainer = d3.select("#chart");

  const chart = renderChart(chartContainer, years, data);
  chart.updateData(filteredData);
});

/**
 * Process data
 */
function processData(csv) {
  // All years
  const years = csv.columns.slice(3);

  // All nutrient types
  const nutrientTypes = [...new Set(csv.map((d) => d.Type))];

  // All regions
  const regions = [...new Set(csv.map((d) => d.Region))];

  // All data with yearly values
  const data = csv.map((d) => ({
    nutrientType: d.Type,
    nutrient: d.Nutrient,
    region: d.Region,
    values: years.map((year) => +d[year]),
  }));

  return {
    data,
    years,
    nutrientTypes,
    regions,
  };
}

/**
 * Filter data
 */
function filterData(data, filters) {
  return data.filter((d) => {
    if (filters.nutrientType !== d.nutrientType) return false;
    if (!filters.regions.includes(d.region)) return false;
    return true;
  });
}

/**
 * Nutrient type control
 */
function renderNutrientTypeControl(container, nutrientTypes, initialValue) {
  // One can only select one nutrient type at a time, use radio buttons
  const fieldset = container.append("fieldset");

  fieldset.append("legend").text("Nutrient Type");

  const item = fieldset
    .selectAll(".form-control")
    .data(nutrientTypes)
    .join("div")
    .attr("class", "form-control");

  item
    .append("input")
    .attr("type", "radio")
    .style("accent-color", "currentColor")
    .attr("name", "nutrientType")
    .attr("id", (d, i) => `nutrientType${i + 1}`)
    .attr("value", (d) => d)
    .attr("checked", (d) => (d === initialValue ? "checked" : null))
    .on("change", handleChange);

  item
    .append("label")
    .attr("for", (d, i) => `nutrientType${i + 1}`)
    .text((d) => d);

  function handleChange(event) {
    // Dispatch a custom filterchange event with the new nutrientType value
    container.dispatch("filterchange", {
      detail: {
        key: "nutrientType",
        value: event.target.value,
      },
    });
  }
}

/**
 * Regions control
 */
function renderRegionsControl(container, regions, initialValues) {
  // One can select up to two regions at a time, use checkboxes
  const MAX_COUNT = 2;

  // Colour the region label to serve as the legend for the line chart
  // If it's not selected, use the currentColor value
  const colorScale = d3
    .scaleOrdinal()
    .domain(initialValues)
    .range(COLOR_SCHEME)
    .unknown("currentColor");

  const fieldset = container.append("fieldset");

  fieldset.append("legend").text(`Region (Up to ${MAX_COUNT})`);

  const item = fieldset
    .selectAll(".form-control")
    .data(regions)
    .join("div")
    .attr("class", "form-control");

  const checkbox = item
    .append("input")
    .attr("type", "checkbox")
    .attr("name", "regions")
    .attr("id", (d, i) => `region${i + 1}`)
    .attr("value", (d) => d)
    .attr("checked", (d) => (initialValues.includes(d) ? "checked" : null))
    .on("change", handleChange);

  const label = item
    .append("label")
    .attr("for", (d, i) => `region${i + 1}`)
    .text((d) => d)
    .style("color", (d) => colorScale(d));

  function handleChange(event) {
    // Get current selected values
    const currentValues = [];
    checkbox.each(function (d) {
      if (this.checked) {
        currentValues.push(d);
      }
    });

    // If the selected values reach the max count, we need to disable the other checkboxes
    if (currentValues.length === MAX_COUNT) {
      checkbox.attr("disabled", (d) =>
        currentValues.includes(d) ? null : "disabled"
      );
    } else {
      checkbox.attr("disabled", null);
    }

    // Update the label colours
    colorScale.domain(currentValues);
    checkbox.style("accent-color", (d) => colorScale(d));
    label.style("color", (d) => colorScale(d));

    // Dispatch a custom filterchange event with the new region values
    container.dispatch("filterchange", {
      detail: {
        key: "regions",
        value: currentValues,
      },
    });
  }
}

/**
 * Multiline trend chart
 */
// Modified from https://observablehq.com/@d3/multi-line-chart
function renderChart(container, years, data) {
  let regions, flatData, delaunay, iDelaunay, gLine, gDot;

  // Dimensions
  const margin = {
    top: 30,
    right: 180,
    bottom: 30,
    left: 30,
  };
  const width = container.node().clientWidth;
  const height = 600;

  // Scales and axes
  const xScale = d3
    .scaleLinear()
    .domain([years[0], years[years.length - 1]])
    .range([margin.left, width - margin.right]);

  const yScale = d3.scaleLinear().range([height - margin.bottom, margin.top]);

  const colorScale = d3.scaleOrdinal().range(COLOR_SCHEME);

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(width / 40)
    .tickSizeOuter(0)
    .tickFormat((d) => d);

  const yAxis = d3.axisLeft(yScale).ticks(height / 80);

  // Line generator
  const lineGenerator = d3
    .line()
    .curve(d3.curveMonotoneX)
    .x((d, i) => xScale(years[i]))
    .y((d) => yScale(d));

  // Draw static elements
  // Svg
  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .on("mouseenter", handleMouseEnter)
    .on("mousemove", handleMouseMove)
    .on("mouseleave", handleMouseLeave);

  const thresholdRect = svg.append("rect").attr("class", "threshold-rect");

  // X axis
  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(xAxis);

  // Y axis
  const gYAxis = svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`);

  // Lines
  const gLines = svg
    .append("g")
    .attr("class", "lines")
    .attr("fill", "none")
    .attr("stroke-width", 1.5);

  // Dots
  const gDots = svg.append("g").attr("class", "dots").attr("display", "none");

  function processData() {
    // Update y scale domain
    const minY = Math.min(
      90, // The min starts from at least 90 so there's space for the band below 100
      d3.min(data, (d) => d3.min(d.values))
    );
    const maxY = d3.max(data, (d) => d3.max(d.values));
    yScale.domain([minY, maxY]).nice();

    // Update colour scale domain
    regions = [...new Set(data.map((d) => d.region))];
    colorScale.domain(regions);

    // https://observablehq.com/@d3/delaunay-find?collection=@d3/d3-delaunay
    // Flatten the data
    flatData = [];
    data.forEach((d) => {
      d.values.forEach((v, i) => {
        flatData.push([years[i], v, d.nutrient]); // Each data point [year, value, nutrient]
      });
    });

    // Compute a new Delaunay triangulation for mousemove closest point find
    delaunay = d3.Delaunay.from(
      flatData,
      (d) => xScale(d[0]),
      (d) => yScale(d[1])
    );

    iDelaunay = null;

    updateChart();
  }

  // Draw dynamic elements
  function updateChart() {
    // Threshold rect
    thresholdRect
      .attr("x", margin.left)
      .attr("y", yScale(100) || height - margin.bottom)
      .attr("width", width - margin.left - margin.right)
      .attr("height", yScale.range()[0] - yScale(100) || 0);

    // Y axis
    gYAxis
      .call(yAxis)
      .call((g) => g.select(".domain").remove())
      .call((g) =>
        g
          .selectAll(".tick line")
          .attr("x2", width - margin.left - margin.right)
          .attr("stroke-opacity", 0.2)
      )
      .call((g) =>
        g
          .selectAll(".axis-title")
          .data([0])
          .join("text")
          .attr("class", "axis-title")
          .attr("x", -margin.left)
          .attr("y", 15)
          .attr("fill", "currentColor")
          .attr("text-anchor", "start")
          .text(
            "Average intake as a percentage of weighted reference nutrient intakes"
          )
      );

    // Lines
    gLine = gLines
      .selectAll(".line")
      .data(data, (d) => `${d.region}-${d.nutrient}`)
      .join((enter) =>
        enter
          .append("g")
          .attr("class", "line")
          .call((g) =>
            g.append("path").attr("class", "line-path").attr("fill", "none")
          )
          .call((g) =>
            g
              .append("text")
              .attr("class", "line-text")
              .attr("x", width - margin.right + 12)
              .attr("dy", "0.32em")
              .text((d) => d.nutrient)
          )
      );

    gLine
      .select(".line-path")
      .attr("stroke", (d) => colorScale(d.region))
      .attr("d", (d) => lineGenerator(d.values));

    gLine.select(".line-text").attr("fill", (d) => colorScale(d.region));

    let currentLabelY = height;
    gLine
      .sort((a, b) => {
        // Sort by the latest value
        return d3.ascending(
          a.values[a.values.length - 1],
          b.values[b.values.length - 1]
        );
      })
      .select(".line-text")
      .attr("y", (d) => {
        // To avoid labels overlapping, we make sure there's at least 12px distance between adjacent labels
        const y = yScale(d.values[d.values.length - 1]);
        currentLabelY = Math.min(currentLabelY - 12, y);
        return currentLabelY;
      });
  }

  function handleMouseEnter() {
    gDots.attr("display", null);
  }

  function handleMouseMove(event) {
    const [xm, ym] = d3.pointer(event);

    const i = delaunay.find(xm, ym, iDelaunay || 0);

    if (i !== iDelaunay) {
      // A new point is found, update the tooltip
      iDelaunay = i;
      const [year, value, nutrient] = flatData[iDelaunay];

      // Highlight lines with the same nutrient
      gLine.attr("opacity", (d) => (d.nutrient === nutrient ? 1 : 0.1));

      // Add a dot tooltip each highlighted data point
      const highlightedData = data.filter((d) => d.nutrient === nutrient);

      const iYear = years.indexOf(year);

      gDot = gDots
        .selectAll(".dot")
        .data(highlightedData, (d) => `${d.region}-${d.nutrient}`)
        .join((enter) =>
          enter
            .append("g")
            .attr("class", "dot")
            .call((dot) =>
              dot
                .append("circle")
                .attr("class", "dot-circle")
                .attr("r", 4)
                .attr("stroke", "#fff")
                .attr("stroke-width", 1.5)
            )
            .call((dot) =>
              dot
                .append("text")
                .attr("class", "dot-text")
                .attr("text-anchor", "middle")
                .attr("y", -6)
            )
        )
        .attr("fill", (d) => colorScale(d.region))
        .attr(
          "transform",
          (d) => `translate(${xScale(year)},${yScale(d.values[iYear])})`
        );

      gDot.select(".dot-text").text((d) => d.values[iYear]);
    }
  }

  function handleMouseLeave() {
    gLine.attr("opacity", 1);
    gDots.attr("display", "none");
  }

  function updateData(newData) {
    data = newData;
    processData();
  }

  return {
    updateData,
  };
}