const chart = bandChart({
  containerId: "weather-band-chart",
  containerWidth: 1200,
  containerHeight: 650,
  dataURL: "weather.csv"
});

function bandChart(options) {
  const containerId = options.containerId;
  const containerWidth =
    options.containerWidth ||
    document.getElementById(containerId).clientWidth ||
    window.innerWidth;
  const containerHeight =
    options.containerHeight ||
    document.getElementById(containerId).clientHeight ||
    window.innerHeight;
  const dataURL = options.dataURL;

  /////////////// Process the Data //////////////////////////////////////////
    d3.csv(dataURL).then(CSV => {
    // const parseDate = d3.timeParse("%-m/%-d/%y");

    const data = CSV.map(d => ({
      date: moment(d.CET, "M/D/YY"),
      high: d.high ? +d.high : undefined,
      low: d.low ? +d.low : undefined
    }));

    const xDomain = d3.extent(data, d => d.date);
    const yDomain = [d3.min(data, d => d.low), d3.max(data, d => d.high)];


    /////////////// Initial Setup /////////////////////////////////////////
        // State
    const highLowValues = {
      high: 10,
      low: 5
    };

    let selections = [];
    let selectionsByPeriod;

    let isDeltaFixed = false;

    let selectedIndicator;

    // Dimension
    const marginLineChart = {
      top: 30,
      right: 40,
      bottom: 200,
      left: 30
    };
    const widthLineChart =
      containerWidth - marginLineChart.left - marginLineChart.right;
    const heightLineChart =
      containerHeight - marginLineChart.top - marginLineChart.bottom;
    const selectionIndicatorHeight = 8;

    const marginBarChart = {
      top: containerHeight - marginLineChart.bottom + 80,
      right: marginLineChart.right + 150,
      bottom: 10,
      left: marginLineChart.left + 150
    };
    const paddingBarChart = 20;
    const widthBarChart =
      containerWidth - marginBarChart.left - marginBarChart.right;
    const heightBarChart =
      containerHeight - marginBarChart.top - marginBarChart.bottom;
    const maxNumBarsPerSide = 10;

    // Style
    const bandFillColor = "#377eb8";
    const highlightFillColor = "#ff7f00";
    const selectedFillColor = "#e41a1c";
    const similarPeriodFillColor = "#4daf4a";

    const highLowLineStrokeColor = "#000";

    const formatTemperature = d => d3.format(".1f")(d) + " ℃";

    // Scale
    // Line chart
    const x = d3
      .scaleTime()
      .domain(xDomain)
      .range([0, widthLineChart]);

    const xOriginal = x.copy();

    const y = d3
      .scaleLinear()
      .domain(yDomain)
      .range([heightLineChart, 0]);

    // Bar chart
    const xBar = d3
      .scaleBand()
      .domain(d3.range(-maxNumBarsPerSide, maxNumBarsPerSide + 1))
      .range([0, widthBarChart - paddingBarChart * 2])
      .padding(0.4);

    const yBar = d3
      .scaleOrdinal()
      .domain([-1, 0, 1])
      .range(
        [0.8, 0.9, 1].map(d => d * (heightBarChart - paddingBarChart * 2))
      );

    // Axis
    const xAxis = function(g) {
      g.call(
        d3
          .axisBottom(x)
          .ticks(widthLineChart / 80)
          .tickSizeOuter(0)
      )
        .call(g => g.select(".domain").remove())
        .call(g =>
          g.selectAll(".tick").each(function(d) {
            if (d3.timeDay(d) < d) {
              d3.select(this).remove();
            }
          })
        );
    };

    const yAxis = function(g) {
      g.call(d3.axisLeft(y))
        .call(g => g.select(".domain").remove())
        .call(g =>
          g
            .select(".tick:last-of-type text")
            .clone()
            .attr("x", 3)
            .attr("text-anchor", "start")
            .attr("font-weight", "bold")
            .text("℃")
        );
    };

    // Area
    const area = d3
      .area()
      .x(d => x(d.date))
      .y0(d => y(d.low))
      .y1(d => y(d.high))
      .defined(d => d.low !== undefined && d.high !== undefined);

    // Zoom
    const zoom = d3
      .zoom()
      .scaleExtent([1, Infinity])
      .translateExtent([[0, 0], [widthLineChart, heightLineChart]])
      .extent([[0, 0], [widthLineChart, heightLineChart]])
      .on("zoom", zoomed);

    function zoomed() {
      const t = d3.event.transform;
      x.domain(t.rescaleX(xOriginal).domain());
      gXAxis.call(xAxis);

      defs
        .select("#highlight-similar-period-clip")
        .selectAll("rect")
        .attr("x", d => x(d.left))
        .attr("width", d => x(d.right) - x(d.left));
      defs
        .select("#highlight-selected-clip")
        .selectAll("rect")
        .attr("x", d => x(d.left))
        .attr("width", d => x(d.right) - x(d.left));

      g.select(".band-path").attr("d", area);
      g.select(".highlight-band-path").attr("d", area);
      g.select(".highlight-similar-period-band-path").attr("d", area);
      g.select(".highlight-selected-band-path").attr("d", area);

      const highlight = g
        .selectAll(".axis-highlight")
        .each(d => {
          d.centerPos = (x(d.left) + x(d.right)) / 2;
          d.width = x(d.right) - x(d.left);
        })
        .attr("transform", d => `translate(${d.centerPos},0)`);
      highlight
        .select("rect")
        .attr("x", d => -d.width / 2)
        .attr("width", d => d.width);
      highlight
        .selectAll(".focus")
        .data(d => [-d.width / 2, d.width / 2])
        .attr("transform", d => `translate(${d}, ${-heightLineChart})`);

      updateBarChartConnectors();
    }

    // Drag
    const drag = d3
      .drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);

    function dragstarted() {
      d3.select(this).attr("cursor", "grabbing");
    }

    function dragged(d) {
      const value = y.invert(d3.event.y);
      if (isDeltaFixed) {
        const delta = highLowValues.high - highLowValues.low;
        switch (d) {
          case "high":
            highLowValues.high = Math.min(
              y.domain()[1],
              Math.max(value, y.domain()[0] + delta)
            );
            highLowValues.low = highLowValues.high - delta;
            break;
          case "low":
            highLowValues.low = Math.max(
              y.domain()[0],
              Math.min(value, y.domain()[1] - delta)
            );
            highLowValues.high = highLowValues.low + delta;
            break;
        }
        updateHighLowLine("high");
        updateHighLowLine("low");
      } else {
        switch (d) {
          case "high":
            highLowValues.high = Math.min(
              y.domain()[1],
              Math.max(value, highLowValues.low + 0.1)
            );
            break;
          case "low":
            highLowValues.low = Math.max(
              y.domain()[0],
              Math.min(value, highLowValues.high - 0.1)
            );
            break;
        }
        updateHighLowLine(d);
      }

      updateSelections();
      updateAxisHighlight();

      highlightSimilarPeriodClip.selectAll("rect").remove();
      highlightSelectedClip.selectAll("rect").remove();
    }

    function dragended() {
      d3.select(this).attr("cursor", "grab");
    }

    const container = d3.select(`#${containerId}`);
    // Checkbox
    const checkbox = container
      .append("div")
      .attr("class", "checkbox")
      .style("right", container.node().offsetWidth - containerWidth + "px");

    checkbox
      .append("input")
      .attr("type", "checkbox")
      .attr("id", "fix-temperature-delta")
      .on("change", () => {
        isDeltaFixed = !isDeltaFixed;
      });
    checkbox
      .append("label")
      .attr("for", "fix-temperature-delta")
      .text("Fix temperature delta");

    // Containers
    const svg = container
      .append("svg")
      .attr("width", containerWidth)
      .attr("height", containerHeight);

    const g = svg
      .append("g")
      .attr(
        "transform",
        `translate(${marginLineChart.left},${marginLineChart.top})`
      );

    const gBarChart = svg.append("g");

    // Clips
    const defs = g.append("defs");

    defs
      .append("clipPath")
      .attr("id", "band-clip")
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", widthLineChart)
      .attr("height", heightLineChart);

    defs
      .append("clipPath")
      .attr("id", "highlight-clip")
      .append("rect")
      .attr("x", 0)
      .attr("y", y(highLowValues.high))
      .attr("width", widthLineChart)
      .attr("height", y(highLowValues.low) - y(highLowValues.high));

    highlightSimilarPeriodClip = defs
      .append("clipPath")
      .attr("id", "highlight-similar-period-clip");

    highlightSelectedClip = defs
      .append("clipPath")
      .attr("id", "highlight-selected-clip");

    defs
      .append("clipPath")
      .attr("id", "highlight-axis-clip")
      .append("rect")
      .attr("x", 0)
      .attr("y", -marginLineChart.top - heightLineChart)
      .attr("width", widthLineChart)
      .attr("height", containerHeight);

    g.append("rect")
      .attr("class", "zoom-rect")
      .attr("width", widthLineChart)
      .attr("height", heightLineChart)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .call(zoom);

    const tooltip = d3
      .select(`#${containerId}`)
      .append("div")
      .attr("class", "chart-tooltip");


    //////////////// Rendering Chart //////////////////////////////////////////
    // Axis
    const gXAxis = g
      .append("g")
      .attr("class", "x-axis")
      .attr(
        "transform",
        `translate(0,${heightLineChart + selectionIndicatorHeight})`
      );

    gXAxis.call(xAxis);

    const gYAxis = g.append("g").attr("class", "y-axis");

    gYAxis.call(yAxis);

    // Band
    const band = g
      .append("path")
      .attr("class", "band-path")
      .datum(data)
      .attr("fill", bandFillColor)
      .attr("pointer-events", "none")
      .attr("clip-path", "url(#band-clip)")
      .attr("d", area);

    const highlightBandG = g
      .append("g")
      .attr("pointer-events", "none")
      .attr("clip-path", "url(#band-clip)");

    const highlightBand = highlightBandG
      .append("path")
      .attr("class", "highlight-band-path")
      .datum(data)
      .attr("clip-path", "url(#highlight-clip)")
      .attr("fill", highlightFillColor)
      .attr("d", area);

    const highlightSimilarPeriodBand = highlightBandG
      .append("path")
      .attr("class", "highlight-similar-period-band-path")
      .datum(data)
      .attr("clip-path", "url(#highlight-similar-period-clip)")
      .attr("fill", similarPeriodFillColor)
      .attr("d", area);

    const highlightSelectedBand = highlightBandG
      .append("path")
      .attr("class", "highlight-selected-band-path")
      .datum(data)
      .attr("clip-path", "url(#highlight-selected-clip)")
      .attr("fill", selectedFillColor)
      .attr("d", area);

    // Axis highlight
    const axisHighlights = g
      .append("g")
      .attr("class", "axis-highlights")
      .attr("transform", `translate(0,${heightLineChart})`)
      .attr("clip-path", "url(#highlight-axis-clip)");

    // High low lines
    const highLowLine = g
      .selectAll("high-low-line-g")
      .data(["high", "low"])
      .enter()
      .append("g")
      .attr("class", d => `high-low-line-g ${d}-line-g`)
      .attr("transform", d => `translate(0, ${y(highLowValues[d]) + 0.5})`)
      .attr("cursor", "grab")
      .call(drag);

    highLowLine
      .append("rect")
      .attr("class", d => `${d}-line-rect`)
      .attr("y", -5)
      .attr("width", widthLineChart)
      .attr("height", 10)
      .attr("fill", "none")
      .attr("pointer-events", "all");

    highLowLine
      .append("line")
      .attr("class", d => `${d}-line-line`)
      .attr("stroke", highLowLineStrokeColor)
      .attr("x1", 0)
      .attr("x2", widthLineChart);

    highLowLine
      .append("text")
      .attr("class", d => `${d}-line-value`)
      .attr("font-weight", "bold")
      .attr("x", widthLineChart + 3)
      .attr("dy", "0.35em")
      .text(d => formatTemperature(highLowValues[d]));

    updateSelections();
    updateAxisHighlight();

    function updateHighLowLine(d) {
      defs
        .select("#highlight-clip")
        .select("rect")
        .attr("y", y(highLowValues.high))
        .attr("height", y(highLowValues.low) - y(highLowValues.high));

      defs
        .select("#highlight-similar-period-clip")
        .selectAll("rect")
        .attr("y", y(highLowValues.high))
        .attr("height", y(highLowValues.low) - y(highLowValues.high));

      defs
        .select("#highlight-selected-clip")
        .selectAll("rect")
        .attr("y", y(highLowValues.high))
        .attr("height", y(highLowValues.low) - y(highLowValues.high));

      highLowLine
        .filter(e => e === d)
        .attr("transform", d => `translate(0, ${y(highLowValues[d]) + 0.5})`)
        .select("text")
        .text(d => formatTemperature(highLowValues[d]));
    }

    function updateAxisHighlight() {
      g.select(".axis-highlights")
        .selectAll("*")
        .remove();

      selectedIndicator = null;
      hideBarChart();

      const highlight = g
        .select(".axis-highlights")
        .selectAll(".axis-highlight")
        .data(selections)
        .enter()
        .append("g")
        .attr("class", "axis-highlight")
        .each(d => {
          d.left = d.start.clone().subtract(12, "hours");
          d.right = d.end.clone().add(12, "hours");
          d.centerPos = (x(d.left) + x(d.right)) / 2;
          d.width = x(d.right) - x(d.left);
        })
        .attr("transform", d => `translate(${d.centerPos},0)`);

      // Axis rectangle
      highlight
        .append("rect")
        .attr("class", "axis-rect")
        .attr("fill", highlightFillColor)
        .attr("y", 0)
        .attr("height", selectionIndicatorHeight)
        .attr("x", d => -d.width / 2)
        .attr("width", d => d.width)
        .style("cursor", "pointer")
        .on("mouseover", function(d) {
          showTooltip(d);
          showFocus.call(this, d);
        })
        .on("mousemove", moveTooltip)
        .on("mouseout", function(d) {
          hideTooltip();
          hideFocus.call(this, d);
        })
        .on("click", clicked);

      highlight
        .append("text")
        .attr("class", "axis-rect-period")
        .attr("text-anchor", "middle")
        .attr("y", 35)
        .text(d => d.period)
        .style("display", "none");

      // Focus
      const focus = highlight
        .append("g")
        .attr("class", "focuses")
        .selectAll(".focus")
        .data(d =>
          ["start", "end"].map((e, i) => ({
            side: e,
            center: d[e],
            edge: e === "start" ? -d.width / 2 : d.width / 2
          }))
        )
        .enter()
        .append("g")
        .attr("class", "focus")
        .attr(
          "transform",
          (d, i) => `translate(${d.edge}, ${-heightLineChart})`
        );

      focus
        .append("line")
        .attr("class", "focus-line")
        .attr("y1", -10)
        .attr("y2", heightLineChart + 40)
        .attr("stroke", "#000")
        .attr("stroke-dasharray", "2")
        .style("display", "none");

      focus
        .append("text")
        .attr("class", "focus-date")
        .attr("text-anchor", d => (d.side === "start" ? "end" : "start"))
        .attr("x", d => (d.side === "start" ? -3 : 3))
        .attr("y", heightLineChart + 35)
        .text(d => d.center.format("M/D/YY"))
        .style("display", "none");
    }

    //////////////// Rendering Bar Chart //////////////////////////////////////
    const gBarChartFrame = gBarChart
      .append("g")
      .attr(
        "transform",
        `translate(${marginBarChart.left},${marginBarChart.top})`
      );

    const barChartRect = gBarChartFrame
      .append("rect")
      .attr("class", "bar-chart-frame")
      .attr("fill", "none")
      .attr("stroke", "#000")
      .attr("width", widthBarChart)
      .attr("height", heightBarChart);

    const barChartConnectors = gBarChart
      .selectAll(".bar-chart-connector")
      .data(["start", "end"])
      .enter()
      .append("line")
      .attr("x1", d =>
        d === "start"
          ? marginBarChart.left
          : marginBarChart.left + widthBarChart
      )
      .attr("y1", marginBarChart.top)
      .attr("y2", marginLineChart.top + heightLineChart + 40)
      .attr("stroke", "#000")
      .attr("stroke-dasharray", "2");

    const barChartLeftEllipsis = gBarChartFrame
      .append("text")
      .attr("class", "bar-chart-ellipsis")
      .attr("text-anchor", "middle")
      .attr("font-weight", "bold")
      .attr("x", paddingBarChart / 2)
      .attr("y", heightBarChart / 2)
      .text("...");

    const barChartRightEllipsis = gBarChartFrame
      .append("text")
      .attr("class", "bar-chart-ellipsis")
      .attr("text-anchor", "middle")
      .attr("font-weight", "bold")
      .attr("x", widthBarChart - paddingBarChart / 2)
      .attr("y", heightBarChart / 2)
      .text("...");

    const gBars = gBarChartFrame
      .append("g")
      .attr("transform", `translate(${paddingBarChart},${paddingBarChart})`);

    hideBarChart();

    function showBarChart(similarPeriods) {
      similarPeriods.sort((a, b) => d3.ascending(a.start, b.start));
      const selectedIndex = similarPeriods.findIndex(d => d.selected === true);
      const selectedPeriod = similarPeriods[selectedIndex].period;
      similarPeriods.forEach((d, i) => {
        d.barIndex = i - selectedIndex;
        d.barHeight =
          d.period < selectedPeriod ? -1 : d.period > selectedPeriod ? 1 : 0;
        d.barShown =
          d.barIndex >= -maxNumBarsPerSide && d.barIndex <= maxNumBarsPerSide;
      });

      // Update ellipsis
      const isLeftEllipsisShown =
        similarPeriods[0].barIndex < -maxNumBarsPerSide;
      const isRightEllipsisShown =
        similarPeriods[similarPeriods.length - 1].barIndex > maxNumBarsPerSide;
      barChartLeftEllipsis.style(
        "display",
        isLeftEllipsisShown ? null : "none"
      );
      barChartRightEllipsis.style(
        "display",
        isRightEllipsisShown ? null : "none"
      );

      // Update bars
      const gBar = gBars
        .selectAll("g")
        .data(similarPeriods.filter(d => d.barShown));

      gBar.exit().remove();

      const gBarEnter = gBar.enter().append("g");
      gBarEnter
        .append("rect")
        .style("cursor", "pointer")
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip)
        .on("click", d => {
          clicked(d);
          centerSelectedIndicator();
        });
      gBarEnter
        .append("text")
        .attr("text-anchor", "middle")
        .attr("fill", "#fff")
        .attr("dy", "1em");

      const gBarMerge = gBarEnter.merge(gBar);
      gBarMerge
        .select("rect")
        .attr("x", d => xBar(d.barIndex))
        .attr(
          "y",
          d => heightBarChart - paddingBarChart * 2 - yBar(d.barHeight)
        )
        .attr("width", xBar.bandwidth())
        .attr("height", d => yBar(d.barHeight))
        .attr("fill", d =>
          d.barIndex === 0 ? selectedFillColor : similarPeriodFillColor
        );
      gBarMerge
        .select("text")
        .attr("x", d => xBar(d.barIndex) + xBar.bandwidth() / 2)
        .attr(
          "y",
          d => heightBarChart - paddingBarChart * 2 - yBar(d.barHeight)
        )
        .text(d => d.period);

      updateBarChartConnectors();
      gBarChart.style("display", null);
    }

    function updateBarChartConnectors() {
      if (!selectedIndicator) return;
      const d = selectedIndicator.datum();
      barChartConnectors.attr("x2", e =>
        e === "start"
          ? d.centerPos - d.width / 2 + marginLineChart.left
          : d.centerPos + d.width / 2 + marginLineChart.left
      );
    }

    function hideBarChart() {
      gBarChart.style("display", "none");
    }

    function centerSelectedIndicator() {
      if (!selectedIndicator) return;
      const d = selectedIndicator.datum();
      // The x axis duration
      const oldStart = moment(x.domain()[0]);
      const oldEnd = moment(x.domain()[1]);
      const xAxisDuration = moment
        .duration(oldEnd.diff(oldStart))
        .asMilliseconds();
      const xAxisHalfDuration = xAxisDuration / 2;
      // The selected indicator duration
      const indicatorDuration = moment
        .duration(d.right.diff(d.left))
        .asMilliseconds();
      const indicatorHalfDuration = indicatorDuration / 2;
      // The amount needs to shift for the indicator to be centered
      const durationShift = xAxisHalfDuration - indicatorHalfDuration;
      let newStart = d.left.clone().subtract(durationShift, "milliseconds");
      let newEnd = d.right.clone().add(durationShift, "milliseconds");
      if (newStart.isBefore(xOriginal.domain()[0])) {
        newStart = moment(xOriginal.domain()[0]);
      } else if (newEnd.isAfter(xOriginal.domain()[1])) {
        newEnd = moment(xOriginal.domain()[1]);
        newStart = newEnd.clone().subtract(xAxisDuration, "milliseconds");
      }

      g.select(".zoom-rect")
        .transition()
        .duration(3000)
        .ease(d3.easeLinear)
        .call(
          zoom.transform,
          d3.zoomIdentity
            .scale(widthLineChart / (xOriginal(newEnd) - xOriginal(newStart)))
            .translate(-xOriginal(newStart), 0)
        );
    }

    /////////////// Tooltip ///////////////////////////////////////////////
    function showTooltip(d) {
      const html = `
      <div>Start Date: ${d.start.format("M/D/YY")}</div>
      <div>End Date: ${d.end.format("M/D/YY")}</div>
      <div>Duration: ${d.period} ${d.period > 1 ? "days" : "day"}</div>
    `;
      tooltip.html(html);
      tooltip.box = tooltip.node().getBoundingClientRect();
      tooltip.transition().style("opacity", 1);
    }

    function moveTooltip() {
      const top = d3.event.clientY - tooltip.box.height - 5;
      let left = d3.event.clientX - tooltip.box.width / 2;
      if (left < 0) {
        left = 0;
      } else if (left + tooltip.box.width > window.innerWidth) {
        left = window.innerWidth - tooltip.box.width;
      }
      tooltip.style("left", left + "px").style("top", top + "px");
    }

    function hideTooltip() {
      tooltip.transition().style("opacity", 0);
    }

    ///////////////////// Focus /////////////////////////////////////////////////
    function showFocus(d) {
      const highlight = d3.select(this.parentNode);
      highlight.select(".axis-rect-period").style("display", null);
      highlight.selectAll(".focus-line").style("display", null);
      highlight.selectAll(".focus-date").style("display", null);
    }

    function hideFocus(d) {
      const highlight = d3.select(this.parentNode);
      highlight
        .select(".axis-rect-period")
        .style("display", d.similarPeriod || d.selected ? null : "none");
      highlight
        .selectAll(".focus-line")
        .style("display", d.similarPeriod || d.selected ? null : "none");
      highlight
        .selectAll(".focus-date")
        .style("display", d.selected ? null : "none");
    }

    //////////////////////// Highlight /////////////////////////////////////////////
    function clicked(d) {
      const highlight = g.selectAll(".axis-highlight");

      if (d.selected) {
        highlight.each(e => {
          e.selected = false;
          e.similarPeriod = false;
        });
        highlightSimilarPeriodClip.selectAll("rect").remove();
        highlightSelectedClip.selectAll("rect").remove();

        selectedIndicator = null;
        hideBarChart();
      } else {
        highlight.each(function(e) {
          e.selected = e === d;
          e.similarPeriod = false;
          if (e.selected) {
            selectedIndicator = d3.select(this);
          }
        });

        highlightSelectedClip
          .selectAll("rect")
          .data([d])
          .join("rect")
          .attr("x", e => x(e.left))
          .attr("y", y(highLowValues.high))
          .attr("width", e => x(e.right) - x(e.left))
          .attr("height", y(highLowValues.low) - y(highLowValues.high));

        if (selections.length === 1) {
          highlightSimilarPeriodClip.selectAll("rect").remove();
          return;
        }

        let similarPeriods = [].concat(selectionsByPeriod.get(d.period));
        let diff = 1;
        while (similarPeriods.length === 1) {
          if (selectionsByPeriod.get(d.period - diff)) {
            similarPeriods = similarPeriods.concat(
              selectionsByPeriod.get(d.period - diff)
            );
          }
          if (selectionsByPeriod.get(d.period + diff)) {
            similarPeriods = similarPeriods.concat(
              selectionsByPeriod.get(d.period + diff)
            );
          }
          diff++;
        }
        similarPeriods.forEach(e => (e.similarPeriod = true));
        highlightSimilarPeriodClip
          .selectAll("rect")
          .data(similarPeriods)
          .join("rect")
          .attr("x", e => x(e.left))
          .attr("y", y(highLowValues.high))
          .attr("width", e => x(e.right) - x(e.left))
          .attr("height", y(highLowValues.low) - y(highLowValues.high));

        showBarChart(similarPeriods);
      }

      highlight.select(".axis-rect").attr("fill", d => {
        if (d.selected) {
          return selectedFillColor;
        } else if (d.similarPeriod) {
          return similarPeriodFillColor;
        } else {
          return highlightFillColor;
        }
      });

      highlight
        .select(".axis-rect-period")
        .style("display", d => (d.similarPeriod || d.selected ? null : "none"));

      const focus = highlight.selectAll(".focus");
      focus.selectAll(".focus-line").style("display", "none");
      focus.selectAll(".focus-date").style("display", "none");
      const similarPeriodFocus = highlight
        .filter(d => d.similarPeriod || d.selected)
        .selectAll(".focus");
      similarPeriodFocus.selectAll(".focus-line").style("display", null);
      similarPeriodFocus.selectAll(".focus-date").style("display", "none");
      const selectedFocus = highlight
        .filter(d => d.selected)
        .selectAll(".focus");
      selectedFocus.selectAll(".focus-line").style("display", null);
      selectedFocus.selectAll(".focus-date").style("display", null);
    }

    //// Utilities /////////////////////////////////////////////

    function updateSelections() {
      selections = [];
      let selected = shouldDayBeSelected(data[0]);
      let indicatorStart = selected ? data[0].date.clone() : undefined;
      let indicatorEnd;
      data.forEach(d => {
        if (isDayDataMissing(d)) {
          if (selected) {
            selections.push({
              start: indicatorStart,
              end: indicatorEnd ? indicatorEnd : indicatorStart
            });
            indicatorStart = undefined;
            indicatorEnd = undefined;
            selected = false;
          }
        } else if (selected) {
          if (shouldDayBeSelected(d)) {
            indicatorEnd = d.date.clone();
          } else {
            selections.push({
              start: indicatorStart,
              end: indicatorEnd ? indicatorEnd : indicatorStart
            });
            indicatorStart = undefined;
            indicatorEnd = undefined;
            selected = false;
          }
        } else {
          if (shouldDayBeSelected(d)) {
            indicatorStart = d.date.clone();
            selected = true;
          }
        }
      });
      if (indicatorStart) {
        selections.push({
          start: indicatorStart,
          end: data[data.length - 1].date.clone()
        });
      }
      selections.forEach(d => (d.period = d.end.diff(d.start, "days") + 1));

      selectionsByPeriod = d3
        .nest()
        .key(d => d.period)
        .map(selections);
    }

    function shouldDayBeSelected(d) {
      return !(d.high < highLowValues.low || d.low > highLowValues.high);
    }

    function isDayDataMissing(d) {
      return d.low === undefined || d.high === undefined;
    }
  });
}
